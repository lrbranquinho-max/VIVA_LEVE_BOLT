create or replace function public.criar_pedido_com_planos(p_itens jsonb,p_metodo text,p_bandeira text,p_cupom_id uuid,p_idempotencia uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
    or length(regexp_replace(coalesce(cli.telefone,pf.telefone,''),'\D','','g'))<10
    or nullif(trim(cli.endereco_rua),'') is null or nullif(trim(cli.endereco_numero),'') is null
    or nullif(trim(cli.bairro),'') is null or nullif(trim(cli.regiao_df),'') is null then raise exception 'Complete nome, telefone e endereço no perfil.'; end if;
  if not exists(select 1 from public.regioes_atendimento where lower(regiao)=lower(cli.regiao_df) and status='ativa') then raise exception 'Região não atendida.'; end if;
  if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 50 then raise exception 'Carrinho inválido.'; end if;
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
    update public.pedidos set pagamento_status='approved',status='Recebido',meio_pagamento='isento' where id=pedido;
    perform public.finalizar_cupom_pedido(pedido::text);
  end if;
  return jsonb_build_object('id',pedido,'valor_total',valor,'itens',itens);
end $$;
