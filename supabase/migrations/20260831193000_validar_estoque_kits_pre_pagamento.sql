-- Recheck all stock immediately before opening a gateway, without reserving it.
create or replace function public.preparar_pagamento_plano(p_pedido_id bigint, p_meio text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_meio text;
  v_produto record;
begin
  select * into v_pedido
    from public.pedidos
   where id = p_pedido_id
   for update;
  if not found or v_pedido.plano_id is not null then
    raise exception 'Pague o pedido principal.';
  end if;
  if v_pedido.checkout_idempotencia is null then return; end if;

  v_meio := case when p_meio like 'cielo_%' then 'cielo' else p_meio end;
  if v_meio not in ('pix', 'mercado_pago', 'cielo') or v_meio is null then
    raise exception 'Meio inválido.';
  end if;
  if v_pedido.pagamento_status = 'approved'
     or v_pedido.status = 'Cancelado'
     or exists (
       select 1 from public.planos_marmitas
        where pedido_id = v_pedido.id and status = 'Cancelado'
     ) then
    raise exception 'Plano pago ou cancelado.';
  end if;
  if not coalesce((
    select (valor->'meios_pagamento'->>v_meio)::boolean
      from public.app_config where chave = 'loja_config'
  ), true) then
    raise exception 'Meio desativado.';
  end if;

  for v_produto in
    select (item->>'id')::bigint as produto_id,
           min(produto.nome) as nome,
           sum((item->>'quantidade')::integer)::integer as quantidade,
           min(produto.estoque_disponivel)::integer as disponivel
      from public.pedidos entrega
      cross join lateral jsonb_array_elements(entrega.itens) item
      join public.produtos produto on produto.id = (item->>'id')::bigint
     where entrega.pedido_origem_id = v_pedido.id
       and entrega.plano_id is not null
       and entrega.status <> 'Cancelado'
       and not entrega.plano_estoque_baixado
     group by (item->>'id')::bigint
     order by (item->>'id')::bigint
  loop
    if v_produto.disponivel < v_produto.quantidade then
      raise exception 'Estoque insuficiente para % no kit. Disponível: %.',
        v_produto.nome, v_produto.disponivel;
    end if;
  end loop;

  update public.pedidos set meio_pagamento = p_meio where id = v_pedido.id;
end;
$$;

revoke all on function public.preparar_pagamento_plano(bigint, text)
  from public, anon, authenticated;
grant execute on function public.preparar_pagamento_plano(bigint, text)
  to service_role;
