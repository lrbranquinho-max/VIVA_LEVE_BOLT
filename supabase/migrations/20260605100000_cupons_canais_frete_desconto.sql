/*
  # Cupons, canais externos e valores do pedido

  - Cupons virtuais amarrados ao cliente.
  - Links oficiais da loja para Instagram, WhatsApp e iFood.
  - Campos de subtotal/frete/desconto em pedidos para auditoria.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.cupons_desconto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  percentual_desconto numeric NOT NULL CHECK (percentual_desconto > 0 AND percentual_desconto <= 100),
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  data_validade timestamptz NOT NULL,
  data_utilizacao timestamptz,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'finalizado'))
);

CREATE INDEX IF NOT EXISTS idx_cupons_desconto_cliente_status
  ON public.cupons_desconto(cliente_id, status, data_validade);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cupons_desconto_primeiro_cadastro
  ON public.cupons_desconto(cliente_id)
  WHERE percentual_desconto = 30;

CREATE TABLE IF NOT EXISTS public.canais_loja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_rede text NOT NULL UNIQUE,
  endereco text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.canais_loja (nome_rede, endereco, ativo)
VALUES
  ('Instagram', 'https://www.instagram.com/', true),
  ('WhatsApp', 'https://wa.me/', true),
  ('iFood', 'https://www.ifood.com.br/', true)
ON CONFLICT (nome_rede) DO NOTHING;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS subtotal_produtos numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_frete numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_percentual numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto_valor numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cupom_id uuid REFERENCES public.cupons_desconto(id);

ALTER TABLE public.cupons_desconto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canais_loja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clientes leem proprios cupons" ON public.cupons_desconto;
DROP POLICY IF EXISTS "Clientes criam proprios cupons" ON public.cupons_desconto;
DROP POLICY IF EXISTS "Admins gerenciam cupons" ON public.cupons_desconto;

CREATE POLICY "Clientes leem proprios cupons"
  ON public.cupons_desconto FOR SELECT TO authenticated
  USING (auth.uid() = cliente_id OR public.is_viva_leve_admin());

CREATE POLICY "Clientes criam proprios cupons"
  ON public.cupons_desconto FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = cliente_id OR public.is_viva_leve_admin());

CREATE POLICY "Admins gerenciam cupons"
  ON public.cupons_desconto FOR ALL TO authenticated
  USING (public.is_viva_leve_admin())
  WITH CHECK (public.is_viva_leve_admin());

DROP POLICY IF EXISTS "Publico le canais ativos" ON public.canais_loja;
DROP POLICY IF EXISTS "Admins gerenciam canais" ON public.canais_loja;

CREATE POLICY "Publico le canais ativos"
  ON public.canais_loja FOR SELECT TO anon, authenticated
  USING (ativo = true OR public.is_viva_leve_admin());

CREATE POLICY "Admins gerenciam canais"
  ON public.canais_loja FOR ALL TO authenticated
  USING (public.is_viva_leve_admin())
  WITH CHECK (public.is_viva_leve_admin());

CREATE OR REPLACE FUNCTION public.finalizar_cupom_pedido(p_pedido_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cupom_id uuid;
BEGIN
  SELECT cupom_id
    INTO v_cupom_id
    FROM public.pedidos
   WHERE id::text = p_pedido_id;

  IF v_cupom_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.cupons_desconto
     SET status = 'finalizado',
         data_utilizacao = COALESCE(data_utilizacao, timezone('utc'::text, now()))
   WHERE id = v_cupom_id
     AND status = 'aberto';
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_cupom_pedido(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalizar_cupom_pedido(text) FROM anon;
REVOKE ALL ON FUNCTION public.finalizar_cupom_pedido(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_cupom_pedido(text) TO service_role;
