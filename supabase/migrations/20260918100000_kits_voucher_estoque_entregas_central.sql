-- Separa o estado financeiro do estado operacional, confirma vouchers na
-- operação e reserva estoque de kits de forma transacional.

alter table public.produtos drop constraint if exists produtos_estoque_reservado_check;
alter table public.produtos
  add constraint produtos_estoque_reservado_check check (estoque_reservado >= 0);

create or replace function public.validar_limites_estoque_produto()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.estoque is null or new.estoque < 0 then
    raise exception 'O estoque físico não pode ser negativo.';
  end if;
  if new.estoque_reservado is null or new.estoque_reservado < 0 then
    raise exception 'O estoque reservado não pode ser negativo.';
  end if;
  return new;
end;
$$;

alter table public.pedidos
  add column if not exists status_pagamento_operacional text
    generated always as (
      case
        when meio_pagamento = 'voucher_presencial'
             and lower(btrim(coalesce(pagamento_status, ''))) not in ('approved','paid','pago','balcao')
          then 'PAGAMENTO_NA_ENTREGA'
        when lower(btrim(coalesce(pagamento_status, ''))) in ('approved','paid','pago','balcao') then 'PAGO'
        when lower(btrim(coalesce(pagamento_status, ''))) in ('refunded','charged_back') then 'ESTORNADO'
        when lower(btrim(coalesce(pagamento_status, ''))) in ('rejected') then 'RECUSADO'
        when lower(btrim(coalesce(pagamento_status, ''))) in ('cancelled','canceled','expired') then 'CANCELADO'
        when lower(btrim(coalesce(pagamento_status, ''))) in ('pending','in_process','authorized') then 'PENDENTE_ONLINE'
        when lower(btrim(coalesce(pagamento_status, ''))) = 'vinculado' then 'VINCULADO'
        else 'NAO_INFORMADO'
      end
    ) stored,
  add column if not exists status_entrega_operacional text
    generated always as (
      case
        when lower(btrim(coalesce(status, ''))) = 'cancelado' then 'CANCELADA'
        when lower(btrim(coalesce(status, ''))) = 'entregue' then 'ENTREGUE'
        when lower(btrim(coalesce(status, ''))) = 'saiu para entrega' then 'EM_ROTA'
        when lower(btrim(coalesce(status, ''))) in ('não entregue','nao entregue') then 'NAO_ENTREGUE'
        when lower(btrim(coalesce(status, ''))) = 'pronta' then 'PRONTA'
        when entregador_id is not null then 'ATRIBUIDA'
        else 'PROGRAMADA'
      end
    ) stored;

create index if not exists pedidos_entrega_operacional_data_idx
  on public.pedidos (status_entrega_operacional, entrega_prevista, criado_em)
  where cancelado_admin_em is null and not somente_planos;
create index if not exists pedidos_pagamento_operacional_idx
  on public.pedidos (status_pagamento_operacional, criado_em desc);

create or replace function public.normalizar_voucher_operacional()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meio_raiz text;
begin
  if new.plano_id is null
     and new.checkout_idempotencia is not null
     and new.meio_pagamento = 'voucher_presencial' then
    new.status := 'Em Preparo';
    new.pagamento_status := coalesce(new.pagamento_status, 'pending');
  elsif new.plano_id is not null and new.pedido_origem_id is not null then
    select meio_pagamento into v_meio_raiz from public.pedidos where id = new.pedido_origem_id;
    if v_meio_raiz = 'voucher_presencial' and new.entrega_numero = 1 then
      new.status := 'Em Preparo';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists a0_normalizar_voucher_operacional on public.pedidos;
create trigger a0_normalizar_voucher_operacional
before insert on public.pedidos
for each row execute function public.normalizar_voucher_operacional();

create or replace function public.ativar_plano_voucher_operacional()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.pedidos
     where id = new.pedido_id and meio_pagamento = 'voucher_presencial'
  ) then
    new.status := 'Ativo';
  end if;
  return new;
end;
$$;

drop trigger if exists a0_ativar_plano_voucher_operacional on public.planos_marmitas;
create trigger a0_ativar_plano_voucher_operacional
before insert on public.planos_marmitas
for each row execute function public.ativar_plano_voucher_operacional();

create or replace function public.reservar_estoque_entrega_voucher()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_voucher boolean := false;
begin
  if new.plano_id is null or new.pedido_origem_id is null then
    return new;
  end if;

  select raiz.meio_pagamento = 'voucher_presencial'
    into v_voucher
    from public.pedidos raiz
   where raiz.id = new.pedido_origem_id
     and lower(btrim(coalesce(raiz.status, ''))) <> 'cancelado';
  if not found then return new; end if;

  for v_item in
    select (item->>'id')::bigint produto_id,
           sum((item->>'quantidade')::integer)::integer quantidade
      from jsonb_array_elements(new.itens) item
     group by 1 order by 1
  loop
    if v_voucher then
      update public.produtos
         set estoque_reservado = estoque_reservado + v_item.quantidade
       where id = v_item.produto_id
         and ativo and disponivel_kit and tipo_produto = 'avulso'
         and estoque - estoque_reservado >= v_item.quantidade;
    else
      perform 1 from public.produtos
       where id = v_item.produto_id
         and ativo and disponivel_kit and tipo_produto = 'avulso'
         and estoque - estoque_reservado >= v_item.quantidade;
    end if;
    if not found then
      raise exception 'Estoque disponível insuficiente para reservar o produto % do kit.', v_item.produto_id;
    end if;

    if v_voucher then
      insert into public.estoque_reservas_kit
        (pedido_id, pedido_entrega_id, produto_id, quantidade, status)
      values
        (new.pedido_origem_id, new.id, v_item.produto_id, v_item.quantidade, 'reservado');
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists ad_reservar_estoque_entrega_voucher on public.pedidos;
create trigger ad_reservar_estoque_entrega_voucher
after insert on public.pedidos
for each row execute function public.reservar_estoque_entrega_voucher();

-- Pedidos de voucher existentes são compromissos válidos. A reconciliação
-- registra inclusive déficit legado; novas compras continuam usando o bloqueio
-- atômico acima e jamais podem criar déficit novo.
with demanda as (
  select (item->>'id')::bigint produto_id,
         sum((item->>'quantidade')::integer)::integer quantidade
    from public.pedidos raiz
    join public.pedidos entrega on entrega.pedido_origem_id = raiz.id
    cross join lateral jsonb_array_elements(entrega.itens) item
   where raiz.meio_pagamento = 'voucher_presencial'
     and lower(btrim(coalesce(raiz.status, ''))) <> 'cancelado'
     and entrega.status not in ('Cancelado','Entregue')
     and not entrega.plano_estoque_baixado
     and not exists (
       select 1 from public.estoque_reservas_kit reserva
        where reserva.pedido_entrega_id = entrega.id
          and reserva.produto_id = (item->>'id')::bigint
          and reserva.status = 'reservado'
     )
   group by 1
)
update public.produtos produto
   set estoque_reservado = produto.estoque_reservado + demanda.quantidade
  from demanda
 where produto.id = demanda.produto_id;

insert into public.estoque_reservas_kit
  (pedido_id, pedido_entrega_id, produto_id, quantidade, status)
select raiz.id, entrega.id, (item->>'id')::bigint,
       sum((item->>'quantidade')::integer)::integer, 'reservado'
  from public.pedidos raiz
  join public.pedidos entrega on entrega.pedido_origem_id = raiz.id
  cross join lateral jsonb_array_elements(entrega.itens) item
 where raiz.meio_pagamento = 'voucher_presencial'
   and lower(btrim(coalesce(raiz.status, ''))) <> 'cancelado'
   and entrega.status not in ('Cancelado','Entregue')
   and not entrega.plano_estoque_baixado
   and not exists (
     select 1 from public.estoque_reservas_kit reserva
      where reserva.pedido_entrega_id = entrega.id
        and reserva.produto_id = (item->>'id')::bigint
        and reserva.status = 'reservado'
   )
 group by raiz.id, entrega.id, (item->>'id')::bigint;

update public.pedidos
   set status = 'Em Preparo', updated_at = now()
 where plano_id is null
   and meio_pagamento = 'voucher_presencial'
   and lower(btrim(coalesce(status, ''))) in ('aguardando pagamento','pendente');

update public.planos_marmitas plano
   set status = 'Ativo'
 where status = 'Aguardando pagamento'
   and exists (
     select 1 from public.pedidos raiz
      where raiz.id = plano.pedido_id
        and raiz.meio_pagamento = 'voucher_presencial'
        and lower(btrim(coalesce(raiz.status, ''))) <> 'cancelado'
   );

update public.pedidos entrega
   set status = 'Em Preparo', updated_at = now()
 where entrega.plano_id is not null
   and entrega.entrega_numero = 1
   and entrega.status in ('Recebido','Agendada')
   and exists (
     select 1 from public.pedidos raiz
      where raiz.id = entrega.pedido_origem_id
        and raiz.meio_pagamento = 'voucher_presencial'
        and lower(btrim(coalesce(raiz.status, ''))) <> 'cancelado'
   );

insert into public.planos_marmitas_historico (plano_id, evento, detalhes, ator_id)
select plano.id, 'voucher_reserva_reconciliada',
       jsonb_build_object('origem','migracao','pagamento','na_entrega'), null
  from public.planos_marmitas plano
  join public.pedidos raiz on raiz.id = plano.pedido_id
 where raiz.meio_pagamento = 'voucher_presencial'
   and lower(btrim(coalesce(raiz.status, ''))) <> 'cancelado'
   and not exists (
     select 1 from public.planos_marmitas_historico h
      where h.plano_id = plano.id and h.evento = 'voucher_reserva_reconciliada'
   );

create or replace function public.gerenciar_entrega_admin(
  p_pedido_id bigint,
  p_acao text,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
      raise exception 'Retire a entrega da rota antes de cancelar.' using errcode = '23514';
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

  insert into public.entregas_historico
    (pedido_id, evento, status_anterior, status_novo, entregador_anterior_id,
     entregador_novo_id, ator_id, ator_tipo, detalhes)
  values
    (v_entrega.id, 'acao_admin_' || p_acao, v_entrega.status, v_novo_status,
     v_entrega.entregador_id, v_entrega.entregador_id, auth.uid(), 'admin',
     jsonb_build_object('observacao', v_obs));

  return jsonb_build_object('ok', true, 'status', v_novo_status);
end;
$$;

create or replace function public.confirmar_entrega_pelo_admin(
  p_pedido_id bigint,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_raiz public.pedidos%rowtype;
  v_observacao text := 'Entrega confirmada via admin.';
  v_detalhe text := nullif(btrim(p_observacao), '');
begin
  if auth.uid() is null or not public.is_viva_leve_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then raise exception 'Entrega não encontrada.' using errcode = 'P0002'; end if;
  if v_pedido.status = 'Entregue' then
    return jsonb_build_object('ok', false, 'message', 'Esta entrega já foi confirmada.');
  end if;
  if v_pedido.status <> 'Saiu para Entrega' then
    return jsonb_build_object('ok', false, 'message', 'A confirmação só pode ser feita quando a entrega estiver em rota.');
  end if;
  if v_pedido.pedido_origem_id is not null then
    select * into v_raiz from public.pedidos where id = v_pedido.pedido_origem_id for update;
  else
    v_raiz := v_pedido;
  end if;
  if v_raiz.status_pagamento_operacional = 'PAGAMENTO_NA_ENTREGA' then
    return jsonb_build_object('ok', false, 'message', 'Confirme o pagamento na entrega antes de concluir.');
  end if;
  if v_raiz.status_pagamento_operacional not in ('PAGO','NAO_INFORMADO') then
    return jsonb_build_object('ok', false, 'message', 'O pagamento ainda não permite concluir a entrega.');
  end if;
  if v_detalhe is not null then v_observacao := v_observacao || ' ' || left(v_detalhe, 1000); end if;

  update public.pedidos
     set status = 'Entregue', entregue_em = now(),
         entrega_metodo_confirmacao = 'administrador', entrega_confirmada_por = auth.uid(),
         entrega_codigo_utilizado_em = now(),
         entrega_observacoes = concat_ws(E'\n', nullif(btrim(entrega_observacoes), ''), v_observacao),
         updated_at = now()
   where id = p_pedido_id and status = 'Saiu para Entrega';
  if not found then
    return jsonb_build_object('ok', false, 'message', 'O status mudou. Atualize a tela e tente novamente.');
  end if;
  return jsonb_build_object('ok', true, 'message', 'Entrega confirmada via admin.');
end;
$$;

create or replace function public.iniciar_entrega_pedido(p_pedido_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_pedido public.pedidos%rowtype;
begin
  if not public.is_viva_leve_delivery() then
    raise exception 'Acesso restrito a entregadores.' using errcode = '42501';
  end if;
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found or v_pedido.entregador_id is distinct from auth.uid() then
    raise exception 'Entrega não encontrada ou não atribuída a você.' using errcode = '42501';
  end if;
  if v_pedido.status not in ('Recebido','Em Preparo','Pronta','Não Entregue') then
    raise exception 'A entrega ainda não pode entrar em rota.';
  end if;
  update public.pedidos set status = 'Saiu para Entrega', updated_at = now()
   where id = p_pedido_id and entregador_id = auth.uid();
end;
$$;

revoke all on function public.normalizar_voucher_operacional(),
  public.ativar_plano_voucher_operacional(),
  public.reservar_estoque_entrega_voucher()
from public, anon, authenticated;
revoke all on function public.gerenciar_entrega_admin(bigint,text,text),
  public.confirmar_entrega_pelo_admin(bigint,text),
  public.iniciar_entrega_pedido(bigint)
from public, anon;
grant execute on function public.gerenciar_entrega_admin(bigint,text,text),
  public.confirmar_entrega_pelo_admin(bigint,text),
  public.iniciar_entrega_pedido(bigint)
to authenticated;

comment on column public.pedidos.status_pagamento_operacional is
  'Status financeiro normalizado e independente do fluxo operacional do pedido.';
comment on column public.pedidos.status_entrega_operacional is
  'Status logístico normalizado, derivado dos campos legados para compatibilidade.';
