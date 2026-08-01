alter table public.pedidos
  add column if not exists meio_pagamento text,
  add column if not exists cielo_payment_id text,
  add column if not exists cielo_tid text,
  add column if not exists cielo_status integer,
  add column if not exists cielo_return_code text,
  add column if not exists cielo_return_message text;

create index if not exists idx_pedidos_cielo_payment_id
  on public.pedidos (cielo_payment_id)
  where cielo_payment_id is not null;

create or replace function public.processar_pagamento_pedido_cielo(
  p_pedido_id text,
  p_payment_id text,
  p_tid text,
  p_cielo_status integer,
  p_return_code text,
  p_return_message text,
  p_pagamento_status text,
  p_status_pedido text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

      if v_produto_id is not null and v_quantidade > 0 then
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
$$;

revoke all on function public.processar_pagamento_pedido_cielo(text, text, text, integer, text, text, text, text) from public;
revoke all on function public.processar_pagamento_pedido_cielo(text, text, text, integer, text, text, text, text) from anon;
revoke all on function public.processar_pagamento_pedido_cielo(text, text, text, integer, text, text, text, text) from authenticated;
grant execute on function public.processar_pagamento_pedido_cielo(text, text, text, integer, text, text, text, text) to service_role;
