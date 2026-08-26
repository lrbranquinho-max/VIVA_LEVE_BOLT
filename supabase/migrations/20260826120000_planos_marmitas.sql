-- A single financial order, with fulfilments in the existing pedidos table.
alter table public.produtos
  add column tipo_produto text not null default 'avulso' check (tipo_produto in ('avulso','kit')),
  add column disponivel_kit boolean not null default false,
  add column plano_config jsonb;

insert into public.app_config(chave,valor) values ('planos_config',
  '{"dias":[1,2,3,4,5,6],"antecedencia_dias":1,"bandeiras":{"Alelo":true,"VR":true,"Ticket":true,"Pluxee":true}}')
on conflict(chave) do nothing;

create table public.planos_marmitas (
  id uuid primary key default gen_random_uuid(),
  pedido_id bigint not null references public.pedidos(id) on delete restrict,
  produto_id bigint not null references public.produtos(id) on delete restrict,
  cliente_id uuid not null references auth.users(id) on delete restrict,
  nome text not null,
  configuracao jsonb not null,
  sabores jsonb not null,
  total_marmitas integer not null check(total_marmitas > 0),
  dia_semana integer not null check(dia_semana between 1 and 6),
  status text not null default 'Aguardando pagamento' check(status in ('Aguardando pagamento','Ativo','Suspenso','Concluído','Cancelado')),
  criado_em timestamptz not null default now()
);
create index planos_marmitas_cliente_idx on public.planos_marmitas(cliente_id,criado_em desc);
create index planos_marmitas_pedido_idx on public.planos_marmitas(pedido_id);
create index planos_marmitas_produto_idx on public.planos_marmitas(produto_id);

alter table public.pedidos
  add column plano_id uuid references public.planos_marmitas(id) on delete restrict,
  add column pedido_origem_id bigint references public.pedidos(id) on delete restrict,
  add column entrega_numero integer,
  add column entrega_prevista date,
  add column plano_estoque_baixado boolean not null default false,
  add column somente_planos boolean not null default false,
  add column voucher_bandeira text,
  add column checkout_idempotencia uuid,
  add constraint pedidos_plano_entrega_check check (
    (plano_id is null and pedido_origem_id is null and entrega_numero is null)
    or (plano_id is not null and pedido_origem_id is not null and entrega_numero > 0 and entrega_prevista is not null and valor_total=0 and total=0 and subtotal_produtos=0 and valor_frete=0)
  ),
  add constraint pedidos_plano_numero_unique unique(plano_id,entrega_numero),
  add constraint pedidos_checkout_unique unique(cliente_id,checkout_idempotencia);
create index pedidos_origem_idx on public.pedidos(pedido_origem_id) where pedido_origem_id is not null;
create index pedidos_agenda_plano_idx on public.pedidos(entrega_prevista,status) where plano_id is not null;

create table public.planos_marmitas_historico (
  id bigint generated always as identity primary key,
  plano_id uuid not null references public.planos_marmitas(id) on delete restrict,
  pedido_entrega_id bigint references public.pedidos(id) on delete restrict,
  evento text not null,
  detalhes jsonb not null default '{}',
  ator_id uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index planos_historico_plano_idx on public.planos_marmitas_historico(plano_id,criado_em);
create index planos_historico_entrega_idx on public.planos_marmitas_historico(pedido_entrega_id);
create index planos_historico_ator_idx on public.planos_marmitas_historico(ator_id);
alter table public.planos_marmitas enable row level security;
alter table public.planos_marmitas_historico enable row level security;
create policy planos_leitura on public.planos_marmitas for select to authenticated
  using(cliente_id=(select auth.uid()) or (select public.is_viva_leve_admin()));
create policy planos_historico_leitura on public.planos_marmitas_historico for select to authenticated
  using(exists(select 1 from public.planos_marmitas p where p.id=plano_id));
revoke all on public.planos_marmitas,public.planos_marmitas_historico from anon,authenticated;
grant select on public.planos_marmitas,public.planos_marmitas_historico to authenticated;
grant all on public.planos_marmitas,public.planos_marmitas_historico to service_role;

create function public.validar_produto_plano() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare c jsonb;
begin
  if tg_op='UPDATE' and new.tipo_produto<>old.tipo_produto and exists(select 1 from public.planos_marmitas where produto_id=new.id) then
    raise exception 'O tipo de um plano vendido não pode ser alterado.';
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
end $$;
create trigger validar_produto_plano_trigger before insert or update on public.produtos for each row execute function public.validar_produto_plano();

insert into public.produtos(nome,descricao,preco,categoria,ativo,tipo_produto,plano_config)
values
('Plano Quinzenal','14 marmitas em 2 entregas semanais de 7 unidades.',0,'Marmitas',false,'kit','{"total_marmitas":14,"entregas":2,"marmitas_por_entrega":7,"intervalo_dias":7,"sabores_min":3,"sabores_max":5,"permite_voucher":true}'),
('Plano Mensal','24 marmitas em 4 entregas semanais de 6 unidades.',0,'Marmitas',false,'kit','{"total_marmitas":24,"entregas":4,"marmitas_por_entrega":6,"intervalo_dias":7,"sabores_min":3,"sabores_max":5,"permite_voucher":true}');

-- Preserve the previous launch/stock rules for ordinary orders; kit creation is atomic via RPC.
create or replace function public.validar_estoque_itens_pedido() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare i record; p record; liberacao timestamptz;
begin
  if new.plano_id is not null then
    if current_user in ('anon','authenticated') then raise exception 'Utilize o fluxo de planos para criar ou alterar entregas.'; end if;
    return new;
  end if;
  select coalesce(nullif(valor->>'data_liberacao_vendas','')::timestamptz,'2026-09-01T00:00:00-03:00') into liberacao from public.app_config where chave='loja_config';
  if now()<coalesce(liberacao,'2026-09-01T00:00:00-03:00') then raise exception 'As vendas estarão disponíveis a partir de 01/09/2026.'; end if;
  if jsonb_typeof(new.itens)<>'array' or jsonb_array_length(new.itens)=0 then raise exception 'O pedido deve conter produtos.'; end if;
  for i in select (item->>'id')::bigint id,sum((item->>'quantidade')::numeric) qtd from jsonb_array_elements(new.itens) item group by 1 loop
    if i.id is null or i.qtd is null or i.qtd<=0 or trunc(i.qtd)<>i.qtd then raise exception 'Quantidade inválida.'; end if;
    select * into p from public.produtos where id=i.id;
    if not found or not p.ativo then raise exception 'Produto indisponível.'; end if;
    if p.tipo_produto='kit' then
      if current_user in ('anon','authenticated') then raise exception 'Configure os sabores e conclua o plano pelo checkout.'; end if;
    elsif p.estoque<i.qtd then raise exception 'Estoque insuficiente para %.',p.nome; end if;
  end loop;
  select jsonb_agg(e || jsonb_build_object('tipo_produto',p.tipo_produto)) into new.itens from jsonb_array_elements(new.itens)e join public.produtos p on p.id=(e->>'id')::bigint;
  return new;
end $$;

create function public.criar_pedido_com_planos(p_itens jsonb,p_metodo text,p_bandeira text,p_cupom_id uuid,p_idempotencia uuid)
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
  select valor into cfg from public.app_config where chave='planos_config';
  select valor into loja from public.app_config where chave='loja_config';
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
        select jsonb_agg(jsonb_build_object('id',id,'nome',nome,'quantidade',qtd,'preco',0,'subtotal',0) order by id) into entrega_itens
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

-- Prevent direct API manipulation of logistics or the single financial order.
create function public.proteger_pedido_plano() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare raiz public.pedidos%rowtype; plano public.planos_marmitas%rowtype; i record;
begin
  if tg_op='INSERT' and (new.plano_id is not null or new.somente_planos or new.checkout_idempotencia is not null or new.meio_pagamento='voucher_presencial') and current_user in ('anon','authenticated') then raise exception 'Utilize o checkout de planos.'; end if;
  if tg_op='UPDATE' then
    if (old.plano_id,old.pedido_origem_id,old.entrega_numero,old.somente_planos,old.checkout_idempotencia) is distinct from (new.plano_id,new.pedido_origem_id,new.entrega_numero,new.somente_planos,new.checkout_idempotencia) then raise exception 'Vínculo do plano é imutável.'; end if;
    if old.checkout_idempotencia is not null and new.itens is distinct from old.itens then raise exception 'Itens do plano contratado são imutáveis.'; end if;
    if current_user in ('anon','authenticated') and (old.plano_id is not null or old.checkout_idempotencia is not null) and
      (old.valor_total,old.pagamento_status,old.entrega_prevista,old.plano_estoque_baixado) is distinct from (new.valor_total,new.pagamento_status,new.entrega_prevista,new.plano_estoque_baixado) then raise exception 'Utilize as ações de planos para alterar pagamento ou programação.'; end if;
  end if;
  if new.plano_id is null then
    if new.somente_planos and (new.entregador_id is not null or new.status in ('Saiu para Entrega','Entregue')) then raise exception 'Atribua e confirme as entregas semanais, não o pedido principal.'; end if;
    return new;
  end if;
  if tg_op='INSERT' then return new; end if;
  if new.itens is distinct from old.itens or new.cliente_id is distinct from old.cliente_id then raise exception 'Sabores e cliente da entrega são imutáveis nesta versão.'; end if;
  if old.status in ('Entregue','Cancelado') and new.status is distinct from old.status then raise exception 'Entrega encerrada não pode ser reaberta.'; end if;
  if new.pagamento_status<>'vinculado' or new.credito_pagamento_id is not null or new.mercado_pago_payment_id is not null or new.cielo_payment_id is not null then raise exception 'A entrega não recebe cobrança própria.'; end if;
  if old.status is not distinct from new.status then return new; end if;
  select * into plano from public.planos_marmitas where id=new.plano_id;
  select * into raiz from public.pedidos where id=new.pedido_origem_id;
  if new.status<>'Cancelado' and plano.status in ('Cancelado','Suspenso') then raise exception 'Plano cancelado ou suspenso.'; end if;
  if new.status in ('Recebido','Em Preparo','Pronta','Saiu para Entrega','Entregue') then
    if coalesce(raiz.pagamento_status,'')<>'approved' and not (new.entrega_numero=1 and raiz.meio_pagamento='voucher_presencial' and new.status<>'Entregue') then raise exception 'Confirme o pagamento integral antes de liberar esta entrega.'; end if;
  end if;
  if new.status='Entregue' and old.status<>'Saiu para Entrega' then raise exception 'Inicie a rota antes de confirmar a entrega.'; end if;
  return new;
end $$;
create trigger aa_proteger_pedido_plano before insert or update on public.pedidos for each row execute function public.proteger_pedido_plano();

-- Stock is consumed once, on preparation, never when buying future weeks.
create function public.baixar_estoque_entrega_plano() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare i record;
begin
  if new.plano_id is not null and not old.plano_estoque_baixado and new.status in ('Em Preparo','Pronta','Saiu para Entrega') then
    for i in select (e->>'id')::bigint id,sum((e->>'quantidade')::int) qtd from jsonb_array_elements(new.itens)e group by 1 order by 1 loop
      update public.produtos set estoque=estoque-i.qtd where id=i.id and estoque>=i.qtd;
      if not found then raise exception 'Estoque insuficiente para preparar o produto %.',i.id; end if;
    end loop;
    new.plano_estoque_baixado:=true;
  end if;
  return new;
end $$;
create trigger ab_baixar_estoque_plano before update of status on public.pedidos for each row execute function public.baixar_estoque_entrega_plano();

create function public.atualizar_saldo_status_plano() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare p record; entregues int;
begin
  if new.plano_id is not null and new.status is distinct from old.status then
    perform 1 from public.planos_marmitas where id=new.plano_id for update;
    select coalesce(sum((e->>'quantidade')::int),0) into entregues from public.pedidos d cross join lateral jsonb_array_elements(d.itens)e where d.plano_id=new.plano_id and d.status='Entregue';
    update public.planos_marmitas set status='Concluído' where id=new.plano_id and total_marmitas=entregues and status<>'Cancelado';
    insert into public.planos_marmitas_historico(plano_id,pedido_entrega_id,evento,detalhes,ator_id)
    values(new.plano_id,new.id,'status_entrega',jsonb_build_object('anterior',old.status,'novo',new.status,'entregues',entregues),auth.uid());
  end if;
  if new.plano_id is null and new.pagamento_status is distinct from old.pagamento_status then
    for p in select id from public.planos_marmitas where pedido_id=new.id loop
      update public.planos_marmitas set status=case when new.pagamento_status='approved' then 'Ativo' when new.pagamento_status in ('refunded','charged_back','cancelled') then 'Suspenso' else 'Aguardando pagamento' end
      where id=p.id and status not in ('Cancelado','Concluído','Suspenso');
      insert into public.planos_marmitas_historico(plano_id,evento,detalhes,ator_id) values(p.id,'pagamento',jsonb_build_object('status',new.pagamento_status,'meio',new.meio_pagamento,'valor',new.valor_total),auth.uid());
    end loop;
  end if;
  if new.plano_id is null and new.status='Cancelado' and old.status is distinct from new.status then
    update public.planos_marmitas set status='Cancelado' where pedido_id=new.id and status<>'Concluído';
    update public.pedidos set status='Cancelado' where pedido_origem_id=new.id and status not in ('Entregue','Cancelado');
  end if;
  return new;
end $$;
create trigger planos_saldo_pagamento after update of status,pagamento_status on public.pedidos for each row execute function public.atualizar_saldo_status_plano();

create function public.gerenciar_plano_marmitas(p_plano_id uuid,p_acao text,p_entrega_id bigint default null,p_data date default null,p_motivo text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.planos_marmitas%rowtype; d public.pedidos%rowtype;
begin
  if not public.is_viva_leve_admin() then raise exception 'Acesso restrito.' using errcode='42501'; end if;
  select * into p from public.planos_marmitas where id=p_plano_id;
  if not found then raise exception 'Plano não encontrado.'; end if;
  if p_acao in ('cancelar','cancelar_entrega','reprogramar') and length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo.'; end if;
  if p_acao='cancelar' then
    update public.planos_marmitas set status='Cancelado' where id=p.id;
    update public.pedidos set status='Cancelado' where plano_id=p.id and status not in ('Entregue','Cancelado');
  elsif p_acao in ('reprogramar','cancelar_entrega','preparar','pronta') then
    select * into d from public.pedidos where id=p_entrega_id and plano_id=p.id for update;
    if not found or d.status in ('Entregue','Cancelado') then raise exception 'Entrega não disponível para alteração.'; end if;
    if p_acao='reprogramar' then
      if d.status='Saiu para Entrega' then raise exception 'Não reprograme uma entrega em rota.'; end if;
      if p_data is null or p_data<(now() at time zone 'America/Sao_Paulo')::date or extract(dow from p_data)=0 then raise exception 'Data inválida; selecione de segunda a sábado.'; end if;
      update public.pedidos set entrega_prevista=p_data where id=d.id;
    elsif p_acao='cancelar_entrega' then
      update public.pedidos set status='Cancelado' where id=d.id;
      update public.planos_marmitas set status='Suspenso' where id=p.id and status<>'Cancelado';
    else
      update public.pedidos set status=case when p_acao='preparar' then 'Em Preparo' else 'Pronta' end where id=d.id;
    end if;
  else raise exception 'Ação inválida.'; end if;
  insert into public.planos_marmitas_historico(plano_id,pedido_entrega_id,evento,detalhes,ator_id)
  values(p.id,p_entrega_id,p_acao,jsonb_build_object('motivo',p_motivo,'data_anterior',d.entrega_prevista,'nova_data',p_data),auth.uid());
end $$;

create function public.registrar_voucher_plano(p_entrega_id bigint,p_aprovado boolean,p_referencia text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.pedidos%rowtype; raiz public.pedidos%rowtype; p record;
begin
  select * into d from public.pedidos where id=p_entrega_id;
  if not found or d.plano_id is null then raise exception 'Entrega de plano não encontrada.'; end if;
  if not public.is_viva_leve_admin() and not (public.is_viva_leve_delivery() and d.entregador_id=auth.uid() and d.status='Saiu para Entrega') then raise exception 'Acesso restrito ao responsável pela entrega.' using errcode='42501'; end if;
  select * into raiz from public.pedidos where id=d.pedido_origem_id for update;
  if raiz.meio_pagamento<>'voucher_presencial' or d.entrega_numero<>1 or raiz.pagamento_status='approved' or d.status='Cancelado' then raise exception 'Cobrança presencial não disponível.'; end if;
  if length(trim(coalesce(p_referencia,'')))<3 then raise exception 'Informe a referência/comprovante da transação ou motivo da recusa.'; end if;
  if exists(select 1 from public.planos_marmitas where pedido_id=raiz.id and status='Cancelado') then raise exception 'Pedido com plano cancelado: revise a cobrança com a administração.'; end if;
  for p in select id from public.planos_marmitas where pedido_id=raiz.id loop
    insert into public.planos_marmitas_historico(plano_id,pedido_entrega_id,evento,detalhes,ator_id)
    values(p.id,d.id,case when p_aprovado then 'voucher_confirmado' else 'voucher_recusado' end,jsonb_build_object('referencia',p_referencia,'valor',raiz.valor_total,'bandeira',raiz.voucher_bandeira),auth.uid());
  end loop;
  if p_aprovado then
    update public.pedidos set pagamento_status='approved',status='Recebido' where id=raiz.id;
    perform public.finalizar_cupom_pedido(raiz.id::text);
  end if;
end $$;

create view public.planos_marmitas_resumo with(security_invoker=true) as
select p.*,coalesce(d.entregues,0)::int as entregues,(p.total_marmitas-coalesce(d.entregues,0))::int as saldo,
 d.proxima_entrega,r.pagamento_status,r.meio_pagamento,r.voucher_bandeira,r.valor_total,r.pago_em,r.endereco_entrega,
 coalesce(c.nome_completo,f.nome,'Cliente') as cliente_nome
from public.planos_marmitas p join public.pedidos r on r.id=p.pedido_id
left join public.perfis_clientes c on c.id=p.cliente_id left join public.perfis f on f.id=p.cliente_id
left join lateral (
 select sum(case when status='Entregue' then (select sum((i->>'quantidade')::int) from jsonb_array_elements(itens)i) else 0 end) entregues,
 min(entrega_prevista) filter(where status not in ('Entregue','Cancelado')) proxima_entrega
 from public.pedidos where plano_id=p.id
)d on true;
grant select on public.planos_marmitas_resumo to authenticated;

revoke all on function public.criar_pedido_com_planos(jsonb,text,text,uuid,uuid),public.gerenciar_plano_marmitas(uuid,text,bigint,date,text),public.registrar_voucher_plano(bigint,boolean,text) from public,anon;
grant execute on function public.criar_pedido_com_planos(jsonb,text,text,uuid,uuid),public.gerenciar_plano_marmitas(uuid,text,bigint,date,text),public.registrar_voucher_plano(bigint,boolean,text) to authenticated;
revoke all on function public.validar_produto_plano(),public.proteger_pedido_plano(),public.baixar_estoque_entrega_plano(),public.atualizar_saldo_status_plano() from public,anon,authenticated;

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
$function$
;

CREATE OR REPLACE FUNCTION public.iniciar_entrega_pedido(p_pedido_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pedido public.pedidos%rowtype;
begin
  if not public.is_viva_leve_delivery() then
    raise exception 'Acesso restrito a entregadores.' using errcode = '42501';
  end if;
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found or v_pedido.entregador_id is distinct from auth.uid() then
    raise exception 'Entrega não encontrada ou não atribuída a você.' using errcode = '42501';
  end if;
  if v_pedido.status not in ('Recebido', 'Em Preparo', 'Pronta') then
    raise exception 'A entrega só pode ser iniciada após o pedido estar recebido ou em preparo.';
  end if;

  update public.pedidos
  set status = 'Saiu para Entrega', updated_at = now()
  where id = p_pedido_id and entregador_id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.listar_minhas_entregas()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(to_jsonb(lista) order by lista.ordem_status, lista.criado_em), '[]'::jsonb)
  from (
    select
      pedidos.id,
      pedidos.status,
      pedidos.endereco_entrega,
      pedidos.endereco,
      case when pedidos.plano_id is null then (select jsonb_agg(i) from jsonb_array_elements(pedidos.itens)i where coalesce(i->>'tipo_produto','avulso')<>'kit') else pedidos.itens end as itens,
      pedidos.criado_em,
      pedidos.updated_at,
      pedidos.entrega_atribuida_em,
      pedidos.saiu_entrega_em,
      pedidos.entregue_em,
      pedidos.entrega_observacoes,
      pedidos.entrega_janela,
      coalesce(raiz.meio_pagamento,pedidos.meio_pagamento) as meio_pagamento,
      coalesce(raiz.pagamento_status,pedidos.pagamento_status) as pagamento_status,
      pedidos.plano_id,pedidos.pedido_origem_id,pedidos.entrega_numero,pedidos.entrega_prevista,
      plano.nome as plano_nome,raiz.valor_total as valor_cobrar,raiz.voucher_bandeira,
      pedidos.tipo_venda,
      coalesce(pedidos.cliente_nome_balcao, clientes.nome_completo, perfis.nome, 'Cliente') as cliente_nome,
      coalesce(pedidos.cliente_telefone_balcao, clientes.telefone, perfis.telefone, '') as cliente_telefone,
      clientes.endereco_complemento,
      null::text as endereco_referencia,
      case
        when pedidos.status = 'Saiu para Entrega' then 1
        when pedidos.status = 'Entregue' then 3
        else 2
      end as ordem_status
    from public.pedidos pedidos
    left join public.pedidos raiz on raiz.id=pedidos.pedido_origem_id
    left join public.planos_marmitas plano on plano.id=pedidos.plano_id
    left join public.perfis_clientes clientes on clientes.id = pedidos.cliente_id
    left join public.perfis perfis on perfis.id = pedidos.cliente_id
    where public.is_viva_leve_delivery()
      and pedidos.entregador_id = auth.uid()
      and not pedidos.somente_planos and pedidos.status<>'Cancelado'
      and (
        pedidos.status <> 'Entregue'
        or coalesce(pedidos.entregue_em, pedidos.updated_at) >= date_trunc('day', now())
      )
  ) lista;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_pagamento_pedido_cielo(p_pedido_id text, p_payment_id text, p_tid text, p_cielo_status integer, p_return_code text, p_return_message text, p_pagamento_status text, p_status_pedido text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pedido public.pedidos%rowtype;
  v_item jsonb;
  v_produto_id integer;
  v_quantidade integer;
begin
  select *
    into v_pedido
    from public.pedidos
   where id::text = p_pedido_id
   for update;

  if not found then
    raise exception 'Pedido % nao encontrado.', p_pedido_id;
  end if;

  if v_pedido.plano_id is not null then raise exception 'Pague apenas o pedido principal do plano.'; end if;
  if exists(select 1 from public.planos_marmitas where pedido_id=v_pedido.id and status='Cancelado') then raise exception 'Pedido com plano cancelado. Contate a administração.'; end if;


  if v_pedido.pagamento_status = 'approved' then
    update public.pedidos
       set cielo_payment_id = coalesce(p_payment_id, cielo_payment_id),
           cielo_tid = coalesce(p_tid, cielo_tid),
           updated_at = timezone('utc'::text, now())
     where id::text = p_pedido_id;
    return;
  end if;

  if p_pagamento_status = 'approved' then
    for v_item in
      select value
        from jsonb_array_elements(coalesce(v_pedido.itens::jsonb, '[]'::jsonb))
    loop
      v_produto_id := nullif(v_item ->> 'id', '')::integer;
      v_quantidade := greatest(coalesce(nullif(v_item ->> 'quantidade', '')::integer, 0), 0);

      if v_produto_id is not null and v_quantidade > 0 and exists(select 1 from public.produtos where id=v_produto_id and tipo_produto<>'kit') then
        update public.produtos
           set estoque = estoque - v_quantidade
         where id = v_produto_id
           and estoque >= v_quantidade;

        if not found then
          raise exception 'Estoque insuficiente para o produto %.', v_produto_id;
        end if;
      end if;
    end loop;
  end if;

  update public.pedidos
     set status = p_status_pedido,
         meio_pagamento = 'cielo_alelo',
         cielo_payment_id = p_payment_id,
         cielo_tid = p_tid,
         cielo_status = p_cielo_status,
         cielo_return_code = p_return_code,
         cielo_return_message = p_return_message,
         pagamento_status = p_pagamento_status,
         updated_at = timezone('utc'::text, now())
   where id::text = p_pedido_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_pagamento_pedido_mp(p_pedido_id text, p_payment_id text, p_pagamento_status text, p_status_pedido text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pedido public.pedidos%ROWTYPE;
  v_item jsonb;
  v_produto_id integer;
  v_quantidade integer;
BEGIN
  SELECT *
    INTO v_pedido
    FROM public.pedidos
   WHERE id::text = p_pedido_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % nao encontrado.', p_pedido_id;
  END IF;

  if v_pedido.plano_id is not null then raise exception 'Pague apenas o pedido principal do plano.'; end if;
  if exists(select 1 from public.planos_marmitas where pedido_id=v_pedido.id and status='Cancelado') then raise exception 'Pedido com plano cancelado. Contate a administração.'; end if;


  IF v_pedido.pagamento_status = 'approved' THEN
    UPDATE public.pedidos
       SET mercado_pago_payment_id = COALESCE(p_payment_id, mercado_pago_payment_id),
           updated_at = timezone('utc'::text, now())
     WHERE id::text = p_pedido_id;
    RETURN;
  END IF;

  IF p_pagamento_status = 'approved' THEN
    FOR v_item IN
      SELECT value
        FROM jsonb_array_elements(COALESCE(v_pedido.itens::jsonb, '[]'::jsonb))
    LOOP
      v_produto_id := NULLIF(v_item ->> 'id', '')::integer;
      v_quantidade := GREATEST(COALESCE(NULLIF(v_item ->> 'quantidade', '')::integer, 0), 0);

      if v_produto_id is not null and v_quantidade > 0 and exists(select 1 from public.produtos where id=v_produto_id and tipo_produto<>'kit') then
        UPDATE public.produtos
           SET estoque = estoque - v_quantidade
         WHERE id = v_produto_id
           AND estoque >= v_quantidade;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Estoque insuficiente para o produto %.', v_produto_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.pedidos
     SET status = p_status_pedido,
         mercado_pago_payment_id = p_payment_id,
         pagamento_status = p_pagamento_status,
         updated_at = timezone('utc'::text, now())
   WHERE id::text = p_pedido_id;
END;
$function$
;
