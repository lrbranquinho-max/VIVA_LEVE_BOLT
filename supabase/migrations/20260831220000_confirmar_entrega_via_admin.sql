-- Permite que um administrador confirme uma entrega quando o cliente nao informa o codigo.
-- A atualizacao usa o mesmo status do fluxo normal para preservar estoque, saldo e auditoria.
create or replace function public.confirmar_entrega_pelo_admin(
  p_pedido_id bigint,
  p_observacao text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_observacao text := 'Entrega confirmada via admin.';
  v_detalhe text := nullif(btrim(p_observacao), '');
begin
  if not public.is_viva_leve_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;

  select *
    into v_pedido
    from public.pedidos
   where id = p_pedido_id
   for update;

  if not found then
    raise exception 'Entrega nao encontrada.' using errcode = 'P0002';
  end if;

  if v_pedido.status = 'Entregue' then
    return jsonb_build_object('ok', false, 'message', 'Esta entrega ja foi confirmada.');
  end if;

  if v_pedido.status <> 'Saiu para Entrega' then
    return jsonb_build_object('ok', false, 'message', 'A confirmacao administrativa so pode ser feita quando a entrega estiver em rota.');
  end if;

  if v_detalhe is not null then
    v_observacao := v_observacao || ' ' || left(v_detalhe, 1000);
  end if;

  update public.pedidos
     set status = 'Entregue',
         entregue_em = now(),
         entrega_metodo_confirmacao = 'administrador',
         entrega_confirmada_por = auth.uid(),
         entrega_codigo_utilizado_em = now(),
         entrega_observacoes = concat_ws(E'\n', nullif(btrim(entrega_observacoes), ''), v_observacao),
         updated_at = now()
   where id = p_pedido_id
     and status = 'Saiu para Entrega';

  if not found then
    return jsonb_build_object('ok', false, 'message', 'O status da entrega foi alterado. Atualize a tela e tente novamente.');
  end if;

  return jsonb_build_object('ok', true, 'message', 'Entrega confirmada via admin.');
end;
$$;

revoke all on function public.confirmar_entrega_pelo_admin(bigint, text) from public, anon;
grant execute on function public.confirmar_entrega_pelo_admin(bigint, text) to authenticated;

comment on function public.confirmar_entrega_pelo_admin(bigint, text) is
  'Confirma entrega em rota por um administrador e registra observacao e auditoria.';
