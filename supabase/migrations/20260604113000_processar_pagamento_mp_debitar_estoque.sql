/*
  # Mercado Pago stock debit

  Processes a Mercado Pago payment notification atomically:
  - locks the order row;
  - ignores duplicate approved notifications already processed;
  - debits product stock for approved payments;
  - updates order/payment status.

  The function is executable only by service_role because it bypasses customer
  RLS and must be called from the server webhook.
*/

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS porcao_g numeric;

CREATE OR REPLACE FUNCTION public.processar_pagamento_pedido_mp(
  p_pedido_id text,
  p_payment_id text,
  p_pagamento_status text,
  p_status_pedido text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE EXCEPTION 'Pedido % não encontrado.', p_pedido_id;
  END IF;

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

      IF v_produto_id IS NOT NULL AND v_quantidade > 0 THEN
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
$$;

REVOKE ALL ON FUNCTION public.processar_pagamento_pedido_mp(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.processar_pagamento_pedido_mp(text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.processar_pagamento_pedido_mp(text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.processar_pagamento_pedido_mp(text, text, text, text) TO service_role;
