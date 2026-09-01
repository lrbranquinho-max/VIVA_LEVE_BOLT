-- Sincroniza o pedido principal quando todas as entregas de um checkout exclusivo de kits terminarem.
create or replace function public.proteger_pedido_plano()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  raiz public.pedidos%rowtype;
  plano public.planos_marmitas%rowtype;
begin
  if tg_op = 'INSERT'
     and (new.plano_id is not null or new.somente_planos or new.checkout_idempotencia is not null or new.meio_pagamento = 'voucher_presencial')
     and current_user in ('anon', 'authenticated') then
    raise exception 'Utilize o checkout de planos.';
  end if;

  if tg_op = 'UPDATE' then
    if (old.plano_id, old.pedido_origem_id, old.entrega_numero, old.somente_planos, old.checkout_idempotencia)
       is distinct from
       (new.plano_id, new.pedido_origem_id, new.entrega_numero, new.somente_planos, new.checkout_idempotencia) then
      raise exception 'Vínculo do plano é imutável.';
    end if;
    if old.checkout_idempotencia is not null and new.itens is distinct from old.itens then
      raise exception 'Itens do plano contratado são imutáveis.';
    end if;
    if current_user in ('anon', 'authenticated')
       and (old.plano_id is not null or old.checkout_idempotencia is not null)
       and (old.valor_total, old.pagamento_status, old.entrega_prevista, old.plano_estoque_baixado)
           is distinct from
           (new.valor_total, new.pagamento_status, new.entrega_prevista, new.plano_estoque_baixado) then
      raise exception 'Utilize as ações de planos para alterar pagamento ou programação.';
    end if;
  end if;

  if new.plano_id is null then
    if new.somente_planos and new.entregador_id is not null then
      raise exception 'Atribua o entregador às entregas semanais, não ao pedido principal.';
    end if;
    if new.somente_planos and new.status = 'Saiu para Entrega' then
      raise exception 'Inicie a rota nas entregas semanais, não no pedido principal.';
    end if;
    if new.somente_planos
       and new.status = 'Entregue'
       and old.status is distinct from new.status
       and (
         not exists (
           select 1 from public.planos_marmitas p where p.pedido_id = new.id
         )
         or exists (
           select 1
             from public.planos_marmitas p
            where p.pedido_id = new.id
              and p.status <> 'Concluído'
         )
         or exists (
           select 1
             from public.pedidos d
            where d.pedido_origem_id = new.id
              and d.status <> 'Entregue'
         )
       ) then
      raise exception 'O pedido principal só pode ser concluído após todas as entregas do kit.';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then return new; end if;
  if new.itens is distinct from old.itens or new.cliente_id is distinct from old.cliente_id then
    raise exception 'Sabores e cliente da entrega são imutáveis nesta versão.';
  end if;
  if old.status in ('Entregue', 'Cancelado') and new.status is distinct from old.status then
    raise exception 'Entrega encerrada não pode ser reaberta.';
  end if;
  if new.pagamento_status <> 'vinculado'
     or new.credito_pagamento_id is not null
     or new.mercado_pago_payment_id is not null
     or new.cielo_payment_id is not null then
    raise exception 'A entrega não recebe cobrança própria.';
  end if;
  if old.status is not distinct from new.status then return new; end if;

  select * into plano from public.planos_marmitas where id = new.plano_id;
  select * into raiz from public.pedidos where id = new.pedido_origem_id;
  if new.status <> 'Cancelado' and plano.status in ('Cancelado', 'Suspenso') then
    raise exception 'Plano cancelado ou suspenso.';
  end if;
  if new.status in ('Recebido', 'Em Preparo', 'Pronta', 'Saiu para Entrega', 'Entregue')
     and coalesce(raiz.pagamento_status, '') <> 'approved'
     and not (new.entrega_numero = 1 and raiz.meio_pagamento = 'voucher_presencial' and new.status <> 'Entregue') then
    raise exception 'Confirme o pagamento integral antes de liberar esta entrega.';
  end if;
  if new.status = 'Entregue' and old.status <> 'Saiu para Entrega' then
    raise exception 'Inicie a rota antes de confirmar a entrega.';
  end if;
  return new;
end;
$$;

create or replace function public.atualizar_saldo_status_plano()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p record;
  entregues integer;
begin
  if new.plano_id is not null and new.status is distinct from old.status then
    perform 1 from public.planos_marmitas where id = new.plano_id for update;
    select coalesce(sum((item->>'quantidade')::integer), 0)
      into entregues
      from public.pedidos entrega
      cross join lateral jsonb_array_elements(entrega.itens) item
     where entrega.plano_id = new.plano_id
       and entrega.status = 'Entregue';

    update public.planos_marmitas
       set status = 'Concluído'
     where id = new.plano_id
       and total_marmitas = entregues
       and status <> 'Cancelado';

    if exists (
         select 1 from public.planos_marmitas plano where plano.pedido_id = new.pedido_origem_id
       )
       and not exists (
         select 1
           from public.planos_marmitas plano
          where plano.pedido_id = new.pedido_origem_id
            and plano.status <> 'Concluído'
       )
       and not exists (
         select 1
           from public.pedidos entrega
          where entrega.pedido_origem_id = new.pedido_origem_id
            and entrega.status <> 'Entregue'
       ) then
      update public.pedidos pedido
         set status = 'Entregue', updated_at = now()
       where pedido.id = new.pedido_origem_id
         and pedido.somente_planos
         and pedido.status not in ('Entregue', 'Cancelado');
    end if;

    insert into public.planos_marmitas_historico
      (plano_id, pedido_entrega_id, evento, detalhes, ator_id)
    values
      (new.plano_id, new.id, 'status_entrega', jsonb_build_object('anterior', old.status, 'novo', new.status, 'entregues', entregues), auth.uid());
  end if;

  if new.plano_id is null and new.pagamento_status is distinct from old.pagamento_status then
    for p in select id from public.planos_marmitas where pedido_id = new.id loop
      update public.planos_marmitas
         set status = case
           when new.pagamento_status = 'approved' then 'Ativo'
           when new.pagamento_status in ('refunded', 'charged_back', 'cancelled') then 'Suspenso'
           else 'Aguardando pagamento'
         end
       where id = p.id
         and status not in ('Cancelado', 'Concluído', 'Suspenso');
      insert into public.planos_marmitas_historico (plano_id, evento, detalhes, ator_id)
      values (p.id, 'pagamento', jsonb_build_object('status', new.pagamento_status, 'meio', new.meio_pagamento, 'valor', new.valor_total), auth.uid());
    end loop;
  end if;

  if new.plano_id is null and new.status = 'Cancelado' and old.status is distinct from new.status then
    update public.planos_marmitas set status = 'Cancelado' where pedido_id = new.id and status <> 'Concluído';
    update public.pedidos set status = 'Cancelado' where pedido_origem_id = new.id and status not in ('Entregue', 'Cancelado');
  end if;
  return new;
end;
$$;

-- Reconciliacao idempotente dos pedidos exclusivos de kits que ja terminaram.
update public.pedidos pedido
   set status = 'Entregue', updated_at = now()
 where pedido.somente_planos
   and pedido.status not in ('Entregue', 'Cancelado')
   and exists (
     select 1 from public.planos_marmitas plano where plano.pedido_id = pedido.id
   )
   and not exists (
     select 1
       from public.planos_marmitas plano
      where plano.pedido_id = pedido.id
        and plano.status <> 'Concluído'
   )
   and exists (
     select 1 from public.pedidos entrega where entrega.pedido_origem_id = pedido.id
   )
   and not exists (
     select 1
       from public.pedidos entrega
      where entrega.pedido_origem_id = pedido.id
        and entrega.status <> 'Entregue'
   );
