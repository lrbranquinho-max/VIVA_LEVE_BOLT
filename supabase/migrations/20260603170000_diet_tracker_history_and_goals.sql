/*
  # Diet tracker goals and detailed meal history

  Adds a per-user calorie goal and ensures detailed consumed-food history is
  available for the intelligent diet tracker.
*/

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS meta_calorias integer NOT NULL DEFAULT 2000;

CREATE TABLE IF NOT EXISTS public.historico_refeicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_consumo date NOT NULL DEFAULT CURRENT_DATE,
  tipo_refeicao text NOT NULL,
  nome_alimento text NOT NULL,
  gramas numeric NOT NULL DEFAULT 100,
  kcal numeric NOT NULL DEFAULT 0,
  proteinas numeric NOT NULL DEFAULT 0,
  carboidratos numeric NOT NULL DEFAULT 0,
  gorduras numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.historico_refeicoes
  ADD COLUMN IF NOT EXISTS gramas numeric NOT NULL DEFAULT 100;

ALTER TABLE public.historico_refeicoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_historico_refeicoes_cliente_data
  ON public.historico_refeicoes(cliente_id, data_consumo DESC);

DROP POLICY IF EXISTS "Users can read own diet" ON public.historico_refeicoes;
DROP POLICY IF EXISTS "Users can insert own diet" ON public.historico_refeicoes;
DROP POLICY IF EXISTS "Users can update own diet" ON public.historico_refeicoes;
DROP POLICY IF EXISTS "Users can delete own diet" ON public.historico_refeicoes;

CREATE POLICY "Users can read own diet"
  ON public.historico_refeicoes FOR SELECT TO authenticated
  USING (auth.uid() = cliente_id);

CREATE POLICY "Users can insert own diet"
  ON public.historico_refeicoes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = cliente_id);

CREATE POLICY "Users can update own diet"
  ON public.historico_refeicoes FOR UPDATE TO authenticated
  USING (auth.uid() = cliente_id)
  WITH CHECK (auth.uid() = cliente_id);

CREATE POLICY "Users can delete own diet"
  ON public.historico_refeicoes FOR DELETE TO authenticated
  USING (auth.uid() = cliente_id);
