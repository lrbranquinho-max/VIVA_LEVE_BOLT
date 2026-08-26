-- Preserve stock and the single payment when using kits with discounts.
CREATE OR REPLACE FUNCTION public.criar_pedido_com_planos(p_itens jsonb, p_metodo text, p_bandeira text, p_cupom_id uuid, p_idempotencia uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid:=auth.uid(); cfg jsonb; loja jsonb; cli public.perfis_clientes%rowtype; pf public.perfis%rowtype;
  p public.produtos%rowtype; sabor public.produtos%rowtype; item jsonb; s jsonb; itens jsonb:='[]'; sabores jsonb; kits jsonb:='[]';
  restante jsonb; entrega_itens jsonb; k jsonb; pedido bigint; plano uuid; filho bigint;
  qtd int; n int; total_sabores int; unidades int; pos int; por_entrega int; quota int; faltam int; data_inicial date;
  subtotal numeric(12,2):=0; frete numeric(12,2); desconto numeric:=0; valor numeric(12,2); cupom numeric;
  apenas boolean:=true; todos_voucher boolean:=true; anterior public.pedidos%rowtype;
begin
  if uid is null then raise exception 'Faça login para comprar.' using errcode='42501'; end if;
  if p_idempotencia is null then raise exception 'Identificador da compra ausente.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||p_idempotencia::text,0));
  select * into anterior from public.pedidos where cliente_id=uid and checkout_idempotencia=p_idempotencia;
  if found then return jsonb_build_object('id',anterior.id,'valor_total',anterior.valor_total,'itens',anterior.itens); end if;
  select c.valor into cfg from public.app_config c where chave='planos_config';
  select c.valor into loja from public.app_config c where chave='loja_config';
  if cfg is null then raise exception 'Configuração dos planos indisponível.'; end if;
  if p_metodo not in ('pix','mercado_pago','cielo','voucher_presencial','credito') or p_metodo is null then raise exception 'Forma de pagamento inválida.'; end if;
  if p_metodo in ('pix','mercado_pago','cielo') and not coalesce((loja->'meios_pagamento'->>p_metodo)::boolean,true) then raise exception 'Meio de pagamento desativado.'; end if;
  if p_metodo='voucher_presencial' and not coalesce((cfg->'bandeiras'->>p_bandeira)::boolean,false) then raise exception 'Bandeira de voucher indisponível.'; end if;
  select * into cli from public.perfis_clientes where id=uid;
  select * into pf from public.perfis where id=uid;
  if nullif(trim(coalesce(cli.nome_completo,pf.nome,'')),'') is null
    or length(regexp_replace(coalesce(cli.telefone,pf.telefone,''),'[^0-9]','','g'))<10
    or nullif(trim(cli.endereco_rua),'') is null or nullif(trim(cli.endereco_numero),'') is null
    or nullif(trim(cli.bairro),'') is null or nullif(trim(cli.regiao_df),'') is null then raise exception 'Complete nome, telefone e endereço no perfil.'; end if;
  if not exists(select 1 from public.regioes_atendimento where lower(regiao)=lower(cli.regiao_df) and status='ativa') then raise exception 'Região não atendida.'; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 50 then raise exception 'Carrinho inválido.'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_itens))<>jsonb_array_length(p_itens) then raise exception 'Produtos duplicados no carrinho.'; end if;
  for item in select value from jsonb_array_elements(p_itens) loop
    select * into p from public.produtos where id=(item->>'id')::bigint for share;
    qtd:=(item->>'quantidade')::int;
    if not found or not p.ativo or p.preco<=0 or qtd is null or qtd not between 1 and 20 then raise exception 'Produto ou quantidade inválida.'; end if;
    if p.tipo_produto='kit' then
      sabores:='[]'; total_sabores:=0; unidades:=0;
      if jsonb_typeof(item->'plano'->'sabores')<>'array' or item->'plano'->'sabores' is null then raise exception 'Escolha os sabores do plano.'; end if;
      for s in select value from jsonb_array_elements(item->'plano'->'sabores') loop
        select * into sabor from public.produtos where id=(s->>'id')::bigint for share;
        n:=(s->>'quantidade')::int;
        if not found or not sabor.ativo or not sabor.disponivel_kit or sabor.tipo_produto<>'avulso' or sabor.categoria::text<>'Marmitas' or n is null or n<1 then raise exception 'Sabor ou quantidade não elegível para kits.'; end if;
        if sabores @> jsonb_build_array(jsonb_build_object('id',sabor.id)) then raise exception 'Sabor repetido.'; end if;
        sabores:=sabores||jsonb_build_array(jsonb_build_object('id',sabor.id,'nome',sabor.nome,'quantidade',n));
        total_sabores:=total_sabores+1; unidades:=unidades+n;
      end loop;
      if total_sabores not between (p.plano_config->>'sabores_min')::int and (p.plano_config->>'sabores_max')::int
        or unidades<>(p.plano_config->>'total_marmitas')::int then raise exception 'Confira o total de marmitas e a quantidade de sabores do plano.'; end if;
      data_inicial:=(item->'plano'->>'primeira_data')::date;
      if data_inicial is null or data_inicial<(now() at time zone 'America/Sao_Paulo')::date+greatest(1,(cfg->>'antecedencia_dias')::int)
        or extract(dow from data_inicial)=0 or not cfg->'dias' @> jsonb_build_array(extract(dow from data_inicial)::int)
        or data_inicial>(now() at time zone 'America/Sao_Paulo')::date+180 then raise exception 'Primeira data de entrega indisponível.'; end if;
      todos_voucher:=todos_voucher and (p.plano_config->>'permite_voucher')::boolean;
      kits:=kits||jsonb_build_array(jsonb_build_object('id',p.id,'nome',p.nome,'quantidade',qtd,'config',p.plano_config,'sabores',sabores,'primeira_data',data_inicial));
    else
      apenas:=false; todos_voucher:=false;
      if p.estoque<qtd then raise exception 'Estoque insuficiente para %.',p.nome; end if;
    end if;
    subtotal:=subtotal+round(p.preco*qtd,2);
    itens:=itens||jsonb_build_array(jsonb_build_object('id',p.id,'nome',p.nome,'descricao',p.descricao,'imagem_url',p.imagem_url,'preco',p.preco,'quantidade',qtd,'subtotal',round(p.preco*qtd,2),'tipo_produto',p.tipo_produto));
  end loop;
  if jsonb_array_length(kits)=0 then raise exception 'Este checkout exige ao menos um plano.'; end if;
  if p_metodo='voucher_presencial' and not todos_voucher then raise exception 'Voucher presencial exige somente planos habilitados na sacola.'; end if;
  frete:=case when subtotal>=100 then 0 else coalesce((loja->>'taxa_entrega_padrao')::numeric,10) end;
  desconto:=case when subtotal>=300 then 10 else 0 end;
  if coalesce((loja->>'cupom_dia_d_ativo')::boolean,false) then desconto:=greatest(desconto,coalesce((loja->>'cupom_dia_d_percentual')::numeric,0)); end if;
  if p_cupom_id is not null then
    select percentual_desconto into cupom from public.cupons_desconto where id=p_cupom_id and cliente_id=uid and status='aberto' and data_validade>=now() for update;
    if not found then raise exception 'Cupom inválido ou expirado.'; end if;
    desconto:=greatest(desconto,cupom);
  end if;
  desconto:=least(100,greatest(0,desconto));
  valor:=round(subtotal-round(subtotal*desconto/100,2)+frete,2);
  insert into public.pedidos(cliente_id,endereco_entrega,itens,valor_total,subtotal_produtos,valor_frete,desconto_percentual,desconto_valor,cupom_id,status,pagamento_status,meio_pagamento,voucher_bandeira,somente_planos,checkout_idempotencia)
  values(uid,concat_ws(', ',cli.endereco_rua,cli.endereco_numero,cli.endereco_complemento,cli.bairro,cli.regiao_df),itens,valor,subtotal,frete,desconto,round(subtotal*desconto/100,2),p_cupom_id,'Aguardando Pagamento','pending',p_metodo,case when p_metodo='voucher_presencial' then p_bandeira end,apenas,p_idempotencia)
  returning id into pedido;
  for k in select value from jsonb_array_elements(kits) loop
    for n in 1..(k->>'quantidade')::int loop
      insert into public.planos_marmitas(pedido_id,produto_id,cliente_id,nome,configuracao,sabores,total_marmitas,dia_semana)
      values(pedido,(k->>'id')::bigint,uid,k->>'nome',k->'config',k->'sabores',(k->'config'->>'total_marmitas')::int,extract(dow from (k->>'primeira_data')::date)) returning id into plano;
      restante:=k->'sabores'; por_entrega:=(k->'config'->>'marmitas_por_entrega')::int;
      for pos in 1..(k->'config'->>'entregas')::int loop
        entrega_itens:='[]'; faltam:=por_entrega;
        -- Round-robin distributes the purchased flavour quantities across the weeks.
        while faltam>0 loop
          for qtd in 0..jsonb_array_length(restante)-1 loop
            quota:=(restante->qtd->>'quantidade')::int;
            if quota>0 and faltam>0 then
              entrega_itens:=entrega_itens||jsonb_build_array(jsonb_build_object('id',(restante->qtd->>'id')::bigint,'nome',restante->qtd->>'nome','quantidade',1,'preco',0,'subtotal',0));
              restante:=jsonb_set(restante,array[qtd::text,'quantidade'],to_jsonb(quota-1)); faltam:=faltam-1;
            end if;
          end loop;
        end loop;
        select jsonb_agg(jsonb_build_object('id',id,'nome',nome,'quantidade',t.qtd,'preco',0,'subtotal',0) order by id) into entrega_itens
        from (select (e->>'id')::bigint id,e->>'nome' nome,count(*) qtd from jsonb_array_elements(entrega_itens)e group by 1,2) t;
        insert into public.pedidos(cliente_id,endereco_entrega,itens,valor_total,status,pagamento_status,meio_pagamento,plano_id,pedido_origem_id,entrega_numero,entrega_prevista)
        select uid,endereco_entrega,entrega_itens,0,case when pos=1 and p_metodo='voucher_presencial' then 'Recebido' else 'Agendada' end,'vinculado',p_metodo,plano,pedido,pos,(k->>'primeira_data')::date+(pos-1)*(k->'config'->>'intervalo_dias')::int from public.pedidos where id=pedido returning id into filho;
      end loop;
      insert into public.planos_marmitas_historico(plano_id,evento,ator_id) values(plano,'contratado',uid);
    end loop;
  end loop;
  if valor=0 then
    for item in select value from jsonb_array_elements(itens) order by (value->>'id')::bigint loop
      if item->>'tipo_produto'='avulso' then
        update public.produtos set estoque=estoque-(item->>'quantidade')::int
        where id=(item->>'id')::bigint and ativo and estoque>=(item->>'quantidade')::int;
        if not found then raise exception 'Estoque insuficiente para %.',item->>'nome'; end if;
      end if;
    end loop;
    update public.pedidos set pagamento_status='approved',status='Recebido',meio_pagamento='isento' where id=pedido;
    perform public.finalizar_cupom_pedido(pedido::text);
  end if;
  return jsonb_build_object('id',pedido,'valor_total',valor,'itens',itens);
end $function$;

CREATE OR REPLACE FUNCTION public.validar_produto_plano()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c jsonb;
begin
  if tg_op='UPDATE' and new.tipo_produto<>old.tipo_produto and (exists(select 1 from public.planos_marmitas where produto_id=new.id)
    or exists(select 1 from public.pedidos where itens @> jsonb_build_array(jsonb_build_object('id',new.id))
      or itens @> jsonb_build_array(jsonb_build_object('id',new.id::text)))) then
    raise exception 'O tipo de um produto com pedidos não pode ser alterado.';
  end if;
  if new.tipo_produto='kit' then
    c:=new.plano_config;
    if c is null or jsonb_typeof(c)<>'object' or not c ?& array['total_marmitas','entregas','marmitas_por_entrega','intervalo_dias','sabores_min','sabores_max','permite_voucher'] then
      raise exception 'Preencha a configuração do plano.';
    end if;
    if exists(select 1 from unnest(array['total_marmitas','entregas','marmitas_por_entrega','intervalo_dias','sabores_min','sabores_max']) k where jsonb_typeof(c->k) is distinct from 'number' or (c->>k)::numeric<>trunc((c->>k)::numeric)) then raise exception 'Preencha quantidades inteiras para o plano.'; end if;
    if (c->>'total_marmitas')::int not between 1 and 1000 or (c->>'entregas')::int not between 1 and 52
      or (c->>'marmitas_por_entrega')::int < 1
      or (c->>'total_marmitas')::int <> (c->>'entregas')::int * (c->>'marmitas_por_entrega')::int
      or (c->>'intervalo_dias')::int not between 7 and 365 or (c->>'intervalo_dias')::int % 7 <> 0
      or (c->>'sabores_min')::int < 1 or (c->>'sabores_max')::int < (c->>'sabores_min')::int
      or (c->>'sabores_max')::int > (c->>'total_marmitas')::int
      or jsonb_typeof(c->'permite_voucher')<>'boolean' then raise exception 'Quantidades, sabores ou frequência do plano inválidos.'; end if;
    if new.ativo and new.preco<=0 then raise exception 'Defina o preço antes de ativar o plano.'; end if;
    new.disponivel_kit:=false;
  elsif new.disponivel_kit and new.categoria::text<>'Marmitas' then
    raise exception 'Somente marmitas avulsas podem ser sabores de kits.';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.aplicar_credito_pedido(p_pedido_id text, p_chave text, p_cliente_id uuid, p_cliente_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido public.pedidos%rowtype;
  v_credito public.creditos_pagamento%rowtype;
  v_movimento public.creditos_pagamento_movimentos%rowtype;
  v_disponivel numeric(12, 2);
  v_aplicado numeric(12, 2);
  v_restante numeric(12, 2);
  v_item jsonb;
  v_produto_id integer;
  v_quantidade integer;
begin
  select * into v_pedido
  from public.pedidos
  where id::text = p_pedido_id
  for update;

  if not found or v_pedido.cliente_id is distinct from p_cliente_id then
    raise exception 'Pedido não encontrado para este usuário.';
  end if;
  if v_pedido.plano_id is not null then raise exception 'Pague apenas o pedido principal do plano.'; end if;
  if exists(select 1 from public.planos_marmitas where pedido_id=v_pedido.id and status='Cancelado') then raise exception 'Pedido com plano cancelado. Contate a administração.'; end if;

  if v_pedido.meio_pagamento='voucher_presencial' and v_pedido.checkout_idempotencia is not null then
    raise exception 'Voucher presencial não pode ser combinado com chave de crédito. Escolha pagar pelo aplicativo.';
  end if;
  if v_pedido.status='Cancelado' then raise exception 'Pedido cancelado.'; end if;
  if v_pedido.pagamento_status = 'approved' then
    raise exception 'Este pedido já foi pago.';
  end if;
  if v_pedido.credito_pagamento_id is not null and v_pedido.credito_status in ('reservado', 'consumido') then
    raise exception 'Este pedido já possui uma chave de crédito aplicada.';
  end if;
  if round(v_pedido.valor_total, 2) <= 0 then
    raise exception 'O pedido não possui valor para abatimento.';
  end if;

  select * into v_credito
  from public.creditos_pagamento
  where upper(btrim(chave)) = upper(btrim(p_chave))
  for update;

  if not found then
    raise exception 'Chave de crédito não encontrada.';
  end if;

  for v_movimento in
    select *
    from public.creditos_pagamento_movimentos
    where credito_id = v_credito.id
      and status = 'reservado'
      and expira_em <= now()
    for update
  loop
    update public.pedidos
       set valor_total = coalesce(credito_valor_original, valor_total),
           credito_status = 'liberado',
           credito_pagamento_id = null,
           credito_valor_aplicado = 0,
           credito_valor_original = null,
           updated_at = timezone('utc'::text, now())
     where id = v_movimento.pedido_id
       and credito_status = 'reservado';

    update public.creditos_pagamento_movimentos
       set status = 'liberado', atualizado_em = now()
     where id = v_movimento.id;

    v_credito.valor_reservado := greatest(v_credito.valor_reservado - v_movimento.valor, 0);
  end loop;

  update public.creditos_pagamento
     set valor_reservado = v_credito.valor_reservado
   where id = v_credito.id;

  if not v_credito.ativo then
    raise exception 'Esta chave de crédito está inativa.';
  end if;
  if v_credito.email_restricao is not null
     and lower(btrim(v_credito.email_restricao)) <> lower(btrim(coalesce(p_cliente_email, ''))) then
    raise exception 'Esta chave de crédito pertence a outro usuário.';
  end if;

  v_disponivel := greatest(round(v_credito.valor_disponivel - v_credito.valor_reservado, 2), 0);
  if v_disponivel <= 0 then
    raise exception 'Esta chave de crédito não possui saldo disponível.';
  end if;

  v_aplicado := least(v_disponivel, round(v_pedido.valor_total, 2));
  v_restante := round(v_pedido.valor_total - v_aplicado, 2);

  if v_restante <= 0 then
    for v_item in
      select value from jsonb_array_elements(coalesce(v_pedido.itens::jsonb, '[]'::jsonb))
    loop
      v_produto_id := nullif(v_item ->> 'id', '')::integer;
      v_quantidade := greatest(coalesce(nullif(v_item ->> 'quantidade', '')::integer, 0), 0);
      if v_produto_id is not null and v_quantidade > 0 and exists(select 1 from public.produtos where id=v_produto_id and tipo_produto<>'kit') then
        update public.produtos
           set estoque = estoque - v_quantidade
         where id = v_produto_id and estoque >= v_quantidade;
        if not found then
          raise exception 'Estoque insuficiente para o produto %.', v_produto_id;
        end if;
      end if;
    end loop;

    update public.creditos_pagamento
       set valor_disponivel = round(valor_disponivel - v_aplicado, 2),
           ativo = case when round(valor_disponivel - v_aplicado, 2) <= 0 then false else ativo end,
           atualizado_em = current_timestamp
     where id = v_credito.id;

    update public.pedidos
       set credito_pagamento_id = v_credito.id,
           credito_valor_aplicado = v_aplicado,
           credito_valor_original = v_pedido.valor_total,
           credito_status = 'consumido',
           valor_total = 0,
           meio_pagamento = 'credito',
           pagamento_status = 'approved',
           status = 'Em Preparo',
           updated_at = timezone('utc'::text, now())
     where id = v_pedido.id;

    insert into public.creditos_pagamento_movimentos (credito_id, pedido_id, valor, status)
    values (v_credito.id, v_pedido.id, v_aplicado, 'consumido');
  else
    update public.creditos_pagamento
       set valor_reservado = round(valor_reservado + v_aplicado, 2),
           atualizado_em = current_timestamp
     where id = v_credito.id;

    update public.pedidos
       set credito_pagamento_id = v_credito.id,
           credito_valor_aplicado = v_aplicado,
           credito_valor_original = v_pedido.valor_total,
           credito_status = 'reservado',
           valor_total = v_restante,
           updated_at = timezone('utc'::text, now())
     where id = v_pedido.id;

    insert into public.creditos_pagamento_movimentos (credito_id, pedido_id, valor, status, expira_em)
    values (v_credito.id, v_pedido.id, v_aplicado, 'reservado', now() + interval '24 hours');
  end if;

  return jsonb_build_object(
    'credito_id', v_credito.id,
    'valor_aplicado', v_aplicado,
    'valor_restante', greatest(v_restante, 0),
    'quitado', v_restante <= 0
  );
end;
$function$;
