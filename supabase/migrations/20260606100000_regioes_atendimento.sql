/*
  # Regioes de atendimento

  Controla as cidades/regioes em que a Viva Leve aceita pedidos.
  A loja consulta somente regioes com status = 'ativa' antes de confirmar
  um pedido.
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.regioes_atendimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regiao text NOT NULL,
  uf char(2) NOT NULL,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'inativa')),
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  atualizado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT regioes_atendimento_regiao_uf_unique UNIQUE (regiao, uf)
);

CREATE INDEX IF NOT EXISTS idx_regioes_atendimento_status
  ON public.regioes_atendimento(status, regiao);

INSERT INTO public.regioes_atendimento (regiao, uf, status)
VALUES
  ('Asa Norte', 'DF', 'ativa'),
  ('Asa Sul', 'DF', 'ativa'),
  ('Aguas Claras', 'DF', 'ativa'),
  ('Ceilandia', 'DF', 'ativa'),
  ('Gama', 'DF', 'ativa'),
  ('Guara', 'DF', 'ativa'),
  ('Lago Norte', 'DF', 'ativa'),
  ('Lago Sul', 'DF', 'ativa'),
  ('Planaltina', 'DF', 'ativa'),
  ('Samambaia', 'DF', 'ativa'),
  ('Santa Maria', 'DF', 'ativa'),
  ('Sobradinho', 'DF', 'ativa'),
  ('Taguatinga', 'DF', 'ativa'),
  ('Vicente Pires', 'DF', 'ativa'),
  ('Cruzeiro', 'DF', 'ativa'),
  ('Nucleo Bandeirante', 'DF', 'ativa'),
  ('Park Way', 'DF', 'ativa'),
  ('Riacho Fundo', 'DF', 'ativa'),
  ('SIA', 'DF', 'ativa'),
  ('Estrutural', 'DF', 'ativa'),
  ('Valparaiso de Goias', 'GO', 'ativa'),
  ('Luziania', 'GO', 'ativa'),
  ('Novo Gama', 'GO', 'ativa'),
  ('Pedregal', 'GO', 'ativa')
ON CONFLICT (regiao, uf) DO NOTHING;

ALTER TABLE public.regioes_atendimento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Publico le regioes ativas" ON public.regioes_atendimento;
DROP POLICY IF EXISTS "Admins gerenciam regioes atendimento" ON public.regioes_atendimento;

CREATE POLICY "Publico le regioes ativas"
  ON public.regioes_atendimento FOR SELECT TO anon, authenticated
  USING (status = 'ativa' OR public.is_viva_leve_admin());

CREATE POLICY "Admins gerenciam regioes atendimento"
  ON public.regioes_atendimento FOR ALL TO authenticated
  USING (public.is_viva_leve_admin())
  WITH CHECK (public.is_viva_leve_admin());

GRANT SELECT ON public.regioes_atendimento TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.regioes_atendimento TO authenticated;
