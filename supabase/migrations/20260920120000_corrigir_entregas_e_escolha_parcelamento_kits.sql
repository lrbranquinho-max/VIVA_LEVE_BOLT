-- Corrige as ações do gerenciador, permite baixa administrativa sem entregador
-- e aceita parcelamento de kits escolhido pelo cliente sem alterar pedidos antigos.

create or replace function public.gerenciar_entrega_admin(
  p_pedido_id bigint, p_acao text, p_observacao text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_entrega public.pedidos%rowtype;
  v_raiz public.pedidos%rowtype;
  v_novo_status text;
  v_obs text := nullif(btrim(p_observacao), '');
begin
  if auth.uid() is null or not public.is_viva_leve_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
  select * into v_entrega from public.pedidos where id = p_pedido_id for update;
  if not found or v_entrega.somente_planos then
    raise exception 'Entrega não encontrada.' using errcode = 'P0002';
  end if;
  if v_entrega.status in ('Entregue','Cancelado') then
    return jsonb_build_object('ok', false, 'message', 'Esta entrega já está encerrada.');
  end if;
  if v_entrega.pedido_origem_id is not null then
    select * into v_raiz from public.pedidos where id = v_entrega.pedido_origem_id for update;
  else
    v_raiz := v_entrega;
  end if;
  if p_acao in ('preparar','pronta','rota')
     and v_raiz.status_pagamento_operacional not in ('PAGO','PAGAMENTO_NA_ENTREGA') then
    raise exception 'O pedido ainda não está confirmado para operação.' using errcode = '23514';
  end if;

  if p_acao = 'preparar' then v_novo_status := 'Em Preparo';
  elsif p_acao = 'pronta' then v_novo_status := 'Pronta';
  elsif p_acao = 'rota' then
    if v_entrega.entregador_id is null then
      raise exception 'Atribua um entregador antes de iniciar a rota.' using errcode = '23514';
    end if;
    v_novo_status := 'Saiu para Entrega';
  elsif p_acao = 'tentativa' then
    if v_entrega.status <> 'Saiu para Entrega' then
      raise exception 'Registre a tentativa apenas para uma entrega em rota.' using errcode = '23514';
    end if;
    if v_obs is null or char_length(v_obs) < 3 then
      raise exception 'Informe o motivo da tentativa não concluída.' using errcode = '22023';
    end if;
    v_novo_status := 'Não Entregue';
  elsif p_acao = 'cancelar' then
    if v_entrega.status = 'Saiu para Entrega' then
      raise exception 'Registre a tentativa e retire a entrega da rota antes de cancelar.' using errcode = '23514';
    end if;
    if v_obs is null or char_length(v_obs) < 3 then
      raise exception 'Informe o motivo do cancelamento.' using errcode = '22023';
    end if;
    v_novo_status := 'Cancelado';
  else
    raise exception 'Ação de entrega inválida.' using errcode = '22023';
  end if;

  update public.pedidos
     set status = v_novo_status,
         entrega_observacoes = case when v_obs is null then entrega_observacoes
           else concat_ws(E'\n', nullif(btrim(entrega_observacoes), ''), v_obs) end,
         updated_at = now()
   where id = v_entrega.id;

  -- O CHECK legado aceita status_alterado; a ação específica permanece nos detalhes.
  insert into public.entregas_historico
    (pedido_id, evento, status_anterior, status_novo, entregador_anterior_id,
     entregador_novo_id, ator_id, ator_tipo, detalhes)
  values
    (v_entrega.id, 'status_alterado', v_entrega.status, v_novo_status,
     v_entrega.entregador_id, v_entrega.entregador_id, auth.uid(), 'admin',
     jsonb_build_object('acao_admin', p_acao, 'observacao', v_obs));
  return jsonb_build_object('ok', true, 'status', v_novo_status);
end;
$$;

create or replace function public.proteger_pedido_plano()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare raiz public.pedidos%rowtype; plano public.planos_marmitas%rowtype;
begin
  if tg_op = 'INSERT'
     and (new.plano_id is not null or new.somente_planos or new.checkout_idempotencia is not null or new.meio_pagamento = 'voucher_presencial')
     and current_user in ('anon', 'authenticated') then
    raise exception 'Utilize o checkout de planos.';
  end if;
  if tg_op = 'UPDATE' then
    if (old.plano_id,old.pedido_origem_id,old.entrega_numero,old.somente_planos,old.checkout_idempotencia)
       is distinct from (new.plano_id,new.pedido_origem_id,new.entrega_numero,new.somente_planos,new.checkout_idempotencia) then
      raise exception 'Vínculo do plano é imutável.';
    end if;
    if old.checkout_idempotencia is not null and new.itens is distinct from old.itens then
      raise exception 'Itens do plano contratado são imutáveis.';
    end if;
    if current_user in ('anon','authenticated')
       and (old.plano_id is not null or old.checkout_idempotencia is not null)
       and (old.valor_total,old.pagamento_status,old.entrega_prevista,old.plano_estoque_baixado)
           is distinct from (new.valor_total,new.pagamento_status,new.entrega_prevista,new.plano_estoque_baixado) then
      raise exception 'Utilize as ações de planos para alterar pagamento ou programação.';
    end if;
  end if;
  if new.plano_id is null then
    if new.somente_planos and new.entregador_id is not null then raise exception 'Atribua o entregador às entregas semanais, não ao pedido principal.'; end if;
    if new.somente_planos and new.status = 'Saiu para Entrega' then raise exception 'Inicie a rota nas entregas semanais, não no pedido principal.'; end if;
    if new.somente_planos and new.status = 'Entregue' and old.status is distinct from new.status and (
      not exists(select 1 from public.planos_marmitas p where p.pedido_id=new.id)
      or exists(select 1 from public.planos_marmitas p where p.pedido_id=new.id and p.status<>'Concluído')
      or exists(select 1 from public.pedidos d where d.pedido_origem_id=new.id and d.status<>'Entregue')
    ) then raise exception 'O pedido principal só pode ser concluído após todas as entregas do kit.'; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then return new; end if;
  if new.itens is distinct from old.itens or new.cliente_id is distinct from old.cliente_id then raise exception 'Sabores e cliente da entrega são imutáveis nesta versão.'; end if;
  if old.status in ('Entregue','Cancelado') and new.status is distinct from old.status then raise exception 'Entrega encerrada não pode ser reaberta.'; end if;
  if new.pagamento_status <> 'vinculado' or new.credito_pagamento_id is not null or new.mercado_pago_payment_id is not null or new.cielo_payment_id is not null then raise exception 'A entrega não recebe cobrança própria.'; end if;
  if old.status is not distinct from new.status then return new; end if;
  select * into plano from public.planos_marmitas where id=new.plano_id;
  select * into raiz from public.pedidos where id=new.pedido_origem_id;
  if new.status<>'Cancelado' and plano.status in ('Cancelado','Suspenso') then raise exception 'Plano cancelado ou suspenso.'; end if;
  if new.status in ('Recebido','Em Preparo','Pronta','Saiu para Entrega','Entregue')
     and coalesce(raiz.pagamento_status,'')<>'approved'
     and not (new.entrega_numero=1 and raiz.meio_pagamento='voucher_presencial' and new.status<>'Entregue') then
    raise exception 'Confirme o pagamento integral antes de liberar esta entrega.';
  end if;
  if new.status='Entregue' and old.status<>'Saiu para Entrega'
     and not (new.entrega_metodo_confirmacao='administrador' and public.is_viva_leve_admin()) then
    raise exception 'Inicie a rota antes de confirmar a entrega.';
  end if;
  return new;
end;
$$;

create or replace function public.baixar_estoque_entrega_plano()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_item record; v_reservado integer;
begin
  if new.plano_id is not null and new.status='Cancelado' and new.status is distinct from old.status and not old.plano_estoque_baixado then
    perform public.liberar_reserva_estoque_kit_entrega(new.id);
  end if;
  if new.plano_id is not null and not old.plano_estoque_baixado
     and new.status in ('Em Preparo','Pronta','Saiu para Entrega','Entregue') then
    for v_item in
      select (item->>'id')::bigint produto_id, sum((item->>'quantidade')::integer)::integer quantidade
      from jsonb_array_elements(new.itens) item group by 1 order by 1
    loop
      select coalesce(sum(quantidade),0)::integer into v_reservado
      from public.estoque_reservas_kit
      where pedido_entrega_id=new.id and produto_id=v_item.produto_id and status='reservado';
      if v_reservado>0 then
        if v_reservado<>v_item.quantidade then raise exception 'A reserva do produto % não corresponde à entrega.',v_item.produto_id; end if;
        update public.produtos set estoque=estoque-v_item.quantidade, estoque_reservado=estoque_reservado-v_item.quantidade
        where id=v_item.produto_id and estoque>=v_item.quantidade and estoque_reservado>=v_item.quantidade;
        if not found then raise exception 'Estoque reservado inconsistente para preparar o produto %.',v_item.produto_id; end if;
        update public.estoque_reservas_kit set status='consumido',atualizado_em=now()
        where pedido_entrega_id=new.id and produto_id=v_item.produto_id and status='reservado';
      else
        update public.produtos set estoque=estoque-v_item.quantidade
        where id=v_item.produto_id and estoque-estoque_reservado>=v_item.quantidade;
        if not found then raise exception 'Estoque disponível insuficiente para preparar o produto %.',v_item.produto_id; end if;
      end if;
    end loop;
    new.plano_estoque_baixado:=true;
  end if;
  return new;
end;
$$;

create or replace function public.confirmar_entrega_pelo_admin(
  p_pedido_id bigint, p_observacao text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_pedido public.pedidos%rowtype; v_raiz public.pedidos%rowtype;
  v_observacao text := 'Entrega confirmada via admin.';
  v_detalhe text := nullif(btrim(p_observacao), '');
begin
  if auth.uid() is null or not public.is_viva_leve_admin() then raise exception 'Acesso restrito a administradores.' using errcode='42501'; end if;
  select * into v_pedido from public.pedidos where id=p_pedido_id for update;
  if not found or v_pedido.somente_planos then raise exception 'Entrega não encontrada.' using errcode='P0002'; end if;
  if v_pedido.status='Entregue' then return jsonb_build_object('ok',false,'message','Esta entrega já foi confirmada.'); end if;
  if v_pedido.status='Cancelado' then return jsonb_build_object('ok',false,'message','Uma entrega cancelada não pode ser concluída.'); end if;
  if v_pedido.pedido_origem_id is not null then select * into v_raiz from public.pedidos where id=v_pedido.pedido_origem_id for update; else v_raiz:=v_pedido; end if;
  if v_raiz.status_pagamento_operacional='PAGAMENTO_NA_ENTREGA' then
    return jsonb_build_object('ok',false,'message','Confirme o pagamento na entrega antes de concluir.');
  end if;
  if v_raiz.status_pagamento_operacional not in ('PAGO','NAO_INFORMADO') then
    return jsonb_build_object('ok',false,'message','O pagamento ainda não permite concluir a entrega.');
  end if;
  if v_detalhe is not null then v_observacao:=v_observacao||' '||left(v_detalhe,1000); end if;
  update public.pedidos set status='Entregue',entregue_em=now(),entrega_metodo_confirmacao='administrador',
    entrega_confirmada_por=auth.uid(),entrega_codigo_utilizado_em=now(),
    entrega_observacoes=concat_ws(E'\n',nullif(btrim(entrega_observacoes),''),v_observacao),updated_at=now()
  where id=p_pedido_id and status not in ('Entregue','Cancelado');
  if not found then return jsonb_build_object('ok',false,'message','O status mudou. Atualize a tela e tente novamente.'); end if;
  return jsonb_build_object('ok',true,'message','Entrega confirmada via admin.');
end;
$$;

create or replace function public.criar_pedido_com_planos(p_itens jsonb,p_metodo text,p_bandeira text,p_cupom_id uuid,p_idempotencia uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  uid uuid:=auth.uid(); cfg jsonb; loja jsonb; cli public.perfis_clientes%rowtype; pf public.perfis%rowtype;
  p public.produtos%rowtype; sabor public.produtos%rowtype; item jsonb; s jsonb; itens jsonb:='[]'; sabores jsonb; kits jsonb:='[]'; config_escolhida jsonb;
  restante jsonb; entrega_itens jsonb; k jsonb; pedido bigint; plano uuid; filho bigint;
  qtd int; n int; total_sabores int; unidades int; pos int; por_entrega int; entregas_escolhidas int; total_kit int; quota int; faltam int; data_inicial date;
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
  select * into cli from public.perfis_clientes where id=uid; select * into pf from public.perfis where id=uid;
  if nullif(trim(coalesce(cli.nome_completo,pf.nome,'')),'') is null or length(regexp_replace(coalesce(cli.telefone,pf.telefone,''),'[^0-9]','','g'))<10
    or nullif(trim(cli.endereco_rua),'') is null or nullif(trim(cli.endereco_numero),'') is null or nullif(trim(cli.bairro),'') is null or nullif(trim(cli.regiao_df),'') is null then raise exception 'Complete nome, telefone e endereço no perfil.'; end if;
  if not exists(select 1 from public.regioes_atendimento where public.normalizar_regiao_atendimento(regiao)=public.normalizar_regiao_atendimento(cli.regiao_df) and status='ativa') then raise exception 'Região não atendida.'; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 50 then raise exception 'Carrinho inválido.'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_itens))<>jsonb_array_length(p_itens) then raise exception 'Produtos duplicados no carrinho.'; end if;
  for item in select value from jsonb_array_elements(p_itens) loop
    select * into p from public.produtos where id=(item->>'id')::bigint for share; qtd:=(item->>'quantidade')::int;
    if not found or not p.ativo or p.preco<=0 or qtd is null or qtd not between 1 and 20 then raise exception 'Produto ou quantidade inválida.'; end if;
    if p.tipo_produto='kit' then
      sabores:='[]'; total_sabores:=0; unidades:=0; total_kit:=(p.plano_config->>'total_marmitas')::int;
      entregas_escolhidas:=coalesce((item->'plano'->>'entregas')::int,(p.plano_config->>'entregas')::int);
      if entregas_escolhidas is null or entregas_escolhidas <= 0 then
        raise exception 'Quantidade de entregas inválida para este kit.';
      end if;
      if not ((total_kit=14 and entregas_escolhidas in (1,2)) or (total_kit=24 and entregas_escolhidas in (1,2,4))
        or (total_kit not in (14,24) and entregas_escolhidas=(p.plano_config->>'entregas')::int))
        or total_kit%entregas_escolhidas<>0 then raise exception 'Quantidade de entregas inválida para este kit.'; end if;
      config_escolhida:=p.plano_config||jsonb_build_object('entregas',entregas_escolhidas,'marmitas_por_entrega',total_kit/entregas_escolhidas);
      if jsonb_typeof(item->'plano'->'sabores')<>'array' or item->'plano'->'sabores' is null then raise exception 'Escolha os sabores do plano.'; end if;
      for s in select value from jsonb_array_elements(item->'plano'->'sabores') loop
        select * into sabor from public.produtos where id=(s->>'id')::bigint for share; n:=(s->>'quantidade')::int;
        if not found or not sabor.ativo or not sabor.disponivel_kit or sabor.tipo_produto<>'avulso' or sabor.categoria::text<>'Marmitas' or n is null or n<1 then raise exception 'Sabor ou quantidade não elegível para kits.'; end if;
        if sabores @> jsonb_build_array(jsonb_build_object('id',sabor.id)) then raise exception 'Sabor repetido.'; end if;
        sabores:=sabores||jsonb_build_array(jsonb_build_object('id',sabor.id,'nome',sabor.nome,'quantidade',n)); total_sabores:=total_sabores+1; unidades:=unidades+n;
      end loop;
      if total_sabores not between (p.plano_config->>'sabores_min')::int and (p.plano_config->>'sabores_max')::int or unidades<>total_kit then raise exception 'Confira o total de marmitas e a quantidade de sabores do plano.'; end if;
      data_inicial:=(item->'plano'->>'primeira_data')::date;
      if data_inicial is null or data_inicial<(now() at time zone 'America/Sao_Paulo')::date+greatest(1,(cfg->>'antecedencia_dias')::int)
        or extract(dow from data_inicial)=0 or not cfg->'dias' @> jsonb_build_array(extract(dow from data_inicial)::int) or data_inicial>(now() at time zone 'America/Sao_Paulo')::date+180 then raise exception 'Primeira data de entrega indisponível.'; end if;
      todos_voucher:=todos_voucher and (p.plano_config->>'permite_voucher')::boolean;
      kits:=kits||jsonb_build_array(jsonb_build_object('id',p.id,'nome',p.nome,'quantidade',qtd,'config',config_escolhida,'sabores',sabores,'primeira_data',data_inicial));
    else
      apenas:=false; todos_voucher:=false; if p.estoque<qtd then raise exception 'Estoque insuficiente para %.',p.nome; end if;
    end if;
    subtotal:=subtotal+round(p.preco*qtd,2);
    itens:=itens||jsonb_build_array(jsonb_build_object('id',p.id,'nome',p.nome,'descricao',p.descricao,'imagem_url',p.imagem_url,'preco',p.preco,'quantidade',qtd,'subtotal',round(p.preco*qtd,2),'tipo_produto',p.tipo_produto));
  end loop;
  if jsonb_array_length(kits)=0 then raise exception 'Este checkout exige ao menos um plano.'; end if;
  if p_metodo='voucher_presencial' and not todos_voucher then raise exception 'Voucher presencial exige somente planos habilitados na sacola.'; end if;
  frete:=case when subtotal>=100 then 0 else coalesce((loja->>'taxa_entrega_padrao')::numeric,10) end;
  desconto:=case when subtotal>=300 then 10 else 0 end;
  if coalesce((loja->>'cupom_dia_d_ativo')::boolean,false) then desconto:=greatest(desconto,coalesce((loja->>'cupom_dia_d_percentual')::numeric,0)); end if;
  if p_cupom_id is not null then select percentual_desconto into cupom from public.cupons_desconto where id=p_cupom_id and cliente_id=uid and status='aberto' and data_validade>=now() for update; if not found then raise exception 'Cupom inválido ou expirado.'; end if; desconto:=greatest(desconto,cupom); end if;
  desconto:=least(100,greatest(0,desconto)); valor:=round(subtotal-round(subtotal*desconto/100,2)+frete,2);
  insert into public.pedidos(cliente_id,endereco_entrega,itens,valor_total,subtotal_produtos,valor_frete,desconto_percentual,desconto_valor,cupom_id,status,pagamento_status,meio_pagamento,voucher_bandeira,somente_planos,checkout_idempotencia)
  values(uid,concat_ws(', ',cli.endereco_rua,cli.endereco_numero,cli.endereco_complemento,cli.bairro,cli.regiao_df),itens,valor,subtotal,frete,desconto,round(subtotal*desconto/100,2),p_cupom_id,'Aguardando Pagamento','pending',p_metodo,case when p_metodo='voucher_presencial' then p_bandeira end,apenas,p_idempotencia) returning id into pedido;
  for k in select value from jsonb_array_elements(kits) loop
    for n in 1..(k->>'quantidade')::int loop
      insert into public.planos_marmitas(pedido_id,produto_id,cliente_id,nome,configuracao,sabores,total_marmitas,dia_semana)
      values(pedido,(k->>'id')::bigint,uid,k->>'nome',k->'config',k->'sabores',(k->'config'->>'total_marmitas')::int,extract(dow from (k->>'primeira_data')::date)) returning id into plano;
      restante:=k->'sabores'; por_entrega:=(k->'config'->>'marmitas_por_entrega')::int;
      for pos in 1..(k->'config'->>'entregas')::int loop
        entrega_itens:='[]'; faltam:=por_entrega;
        while faltam>0 loop
          for qtd in 0..jsonb_array_length(restante)-1 loop quota:=(restante->qtd->>'quantidade')::int; if quota>0 and faltam>0 then entrega_itens:=entrega_itens||jsonb_build_array(jsonb_build_object('id',(restante->qtd->>'id')::bigint,'nome',restante->qtd->>'nome','quantidade',1,'preco',0,'subtotal',0)); restante:=jsonb_set(restante,array[qtd::text,'quantidade'],to_jsonb(quota-1)); faltam:=faltam-1; end if; end loop;
        end loop;
        select jsonb_agg(jsonb_build_object('id',id,'nome',nome,'quantidade',t.qtd,'preco',0,'subtotal',0) order by id) into entrega_itens from (select (e->>'id')::bigint id,e->>'nome' nome,count(*) qtd from jsonb_array_elements(entrega_itens)e group by 1,2)t;
        insert into public.pedidos(cliente_id,endereco_entrega,itens,valor_total,status,pagamento_status,meio_pagamento,plano_id,pedido_origem_id,entrega_numero,entrega_prevista)
        select uid,endereco_entrega,entrega_itens,0,case when pos=1 and p_metodo='voucher_presencial' then 'Recebido' else 'Agendada' end,'vinculado',p_metodo,plano,pedido,pos,(k->>'primeira_data')::date+(pos-1)*(k->'config'->>'intervalo_dias')::int from public.pedidos where id=pedido returning id into filho;
      end loop;
      insert into public.planos_marmitas_historico(plano_id,evento,ator_id) values(plano,'contratado',uid);
    end loop;
  end loop;
  if valor=0 then
    for item in select value from jsonb_array_elements(itens) order by (value->>'id')::bigint loop if item->>'tipo_produto'='avulso' then update public.produtos set estoque=estoque-(item->>'quantidade')::int where id=(item->>'id')::bigint and ativo and estoque>=(item->>'quantidade')::int; if not found then raise exception 'Estoque insuficiente para %.',item->>'nome'; end if; end if; end loop;
    update public.pedidos set pagamento_status='approved',status='Recebido',meio_pagamento='isento' where id=pedido; perform public.finalizar_cupom_pedido(pedido::text);
  end if;
  return jsonb_build_object('id',pedido,'valor_total',valor,'itens',itens);
end;
$$;

revoke all on function public.gerenciar_entrega_admin(bigint,text,text), public.confirmar_entrega_pelo_admin(bigint,text), public.criar_pedido_com_planos(jsonb,text,text,uuid,uuid) from public,anon;
grant execute on function public.gerenciar_entrega_admin(bigint,text,text), public.confirmar_entrega_pelo_admin(bigint,text), public.criar_pedido_com_planos(jsonb,text,text,uuid,uuid) to authenticated;
revoke all on function public.proteger_pedido_plano(), public.baixar_estoque_entrega_plano() from public,anon,authenticated;
