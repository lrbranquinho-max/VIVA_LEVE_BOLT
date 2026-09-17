alter table public.pedidos
  add column if not exists cancelado_admin_em timestamptz,
  add column if not exists cancelado_admin_por uuid references auth.users(id) on delete set null,
  add column if not exists cancelamento_admin_motivo text,
  add column if not exists cancelamento_gateway jsonb;

comment on column public.pedidos.cancelado_admin_em is
  'Data da baixa administrativa de um pedido ainda não pago. Mantém o pedido para auditoria.';
comment on column public.pedidos.cancelado_admin_por is
  'Administrador autenticado que realizou a baixa do pedido não pago.';
comment on column public.pedidos.cancelamento_admin_motivo is
  'Motivo informado pelo administrador para a baixa do pedido não pago.';
comment on column public.pedidos.cancelamento_gateway is
  'Resultado não sensível do cancelamento/expiração no provedor de pagamento.';

-- Pedidos antigos já encerrados usavam grafias diferentes de "Cancelado".
-- O preenchimento apenas os retira das filas operacionais; nenhum registro é apagado.
update public.pedidos
   set cancelado_admin_em = coalesce(updated_at, criado_em, now()),
       cancelamento_admin_motivo = coalesce(cancelamento_admin_motivo, 'Pedido já cancelado antes da auditoria administrativa.')
 where cancelado_admin_em is null
   and lower(btrim(coalesce(status, ''))) = 'cancelado';

create index if not exists pedidos_fila_operacional_idx
  on public.pedidos (criado_em desc)
  where cancelado_admin_em is null;

create or replace function public.cancelar_pedido_nao_pago_admin(
  p_pedido_id bigint,
  p_motivo text,
  p_gateway_result jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_admin_id uuid := auth.uid();
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if v_admin_id is null or not public.is_viva_leve_admin() then
    raise exception 'Apenas administradores podem cancelar pedidos.' using errcode = '42501';
  end if;
  if v_motivo is null or char_length(v_motivo) < 3 then
    raise exception 'Informe um motivo com pelo menos 3 caracteres.' using errcode = '22023';
  end if;
  if char_length(v_motivo) > 500 then
    raise exception 'O motivo deve ter no máximo 500 caracteres.' using errcode = '22023';
  end if;

  select * into v_pedido
    from public.pedidos
   where id = p_pedido_id
   for update;

  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  if v_pedido.plano_id is not null or v_pedido.pedido_origem_id is not null then
    raise exception 'Cancele o pedido principal, não uma entrega do kit.' using errcode = '22023';
  end if;
  if v_pedido.cancelado_admin_em is not null
     or lower(btrim(coalesce(v_pedido.status, ''))) = 'cancelado' then
    return jsonb_build_object('ok', true, 'already_cancelled', true, 'pedido_id', v_pedido.id);
  end if;
  if v_pedido.pago_em is not null
     or lower(btrim(coalesce(v_pedido.pagamento_status, ''))) in ('approved', 'paid', 'pago', 'balcao') then
    raise exception 'Pedido pago não pode ser cancelado por esta ação.' using errcode = '23514';
  end if;
  if lower(btrim(coalesce(v_pedido.status, ''))) not in
     ('pendente', 'aguardando pagamento', 'pagamento recusado') then
    raise exception 'Somente pedidos pendentes ou com pagamento recusado podem ser cancelados.' using errcode = '23514';
  end if;
  if v_pedido.entregador_id is not null
     or v_pedido.saiu_entrega_em is not null
     or v_pedido.entregue_em is not null then
    raise exception 'Pedido já movimentado na entrega não pode ser cancelado por esta ação.' using errcode = '23514';
  end if;

  if v_pedido.credito_status = 'reservado' then
    perform public.liberar_credito_pedido(v_pedido.id::text, null);
  end if;

  update public.pedidos
     set status = 'Cancelado',
         pagamento_status = case
           when lower(btrim(coalesce(pagamento_status, ''))) in ('pending', 'in_process', 'authorized')
             then 'cancelled'
           else pagamento_status
         end,
         cancelado_admin_em = now(),
         cancelado_admin_por = v_admin_id,
         cancelamento_admin_motivo = v_motivo,
         cancelamento_gateway = coalesce(p_gateway_result, '{}'::jsonb),
         entregador_id = null,
         entrega_atribuida_em = null,
         updated_at = now()
   where id = v_pedido.id;

  return jsonb_build_object('ok', true, 'already_cancelled', false, 'pedido_id', v_pedido.id);
end;
$$;

revoke all on function public.cancelar_pedido_nao_pago_admin(bigint, text, jsonb) from public, anon;
grant execute on function public.cancelar_pedido_nao_pago_admin(bigint, text, jsonb) to authenticated;
