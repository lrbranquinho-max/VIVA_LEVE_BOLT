/*
  # Diet profile and Mercado Pago checkout support

  Adds optional fields used to calculate the customer's calorie target and
  payment tracking fields used by Mercado Pago Checkout Pro webhooks.
*/

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS meta_calorias integer NOT NULL DEFAULT 2000;

ALTER TABLE public.perfis_clientes
  ADD COLUMN IF NOT EXISTS sexo text,
  ADD COLUMN IF NOT EXISTS peso_kg numeric,
  ADD COLUMN IF NOT EXISTS altura_cm numeric,
  ADD COLUMN IF NOT EXISTS idade integer,
  ADD COLUMN IF NOT EXISTS nivel_atividade text NOT NULL DEFAULT 'sedentario';

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS mercado_pago_preference_id text,
  ADD COLUMN IF NOT EXISTS mercado_pago_payment_id text,
  ADD COLUMN IF NOT EXISTS pagamento_status text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_pedidos_mercado_pago_payment_id
  ON public.pedidos(mercado_pago_payment_id);

CREATE INDEX IF NOT EXISTS idx_pedidos_pagamento_status
  ON public.pedidos(pagamento_status);
