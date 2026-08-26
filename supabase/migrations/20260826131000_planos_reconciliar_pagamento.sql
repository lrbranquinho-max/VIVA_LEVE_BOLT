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
$function$;
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
$function$;
