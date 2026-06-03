/*
  # Align live schema and enable RLS

  Applied to project kdhdtdwayqdbkxbbpawm on 2026-06-03.

  - Adds compatibility timestamp/alias columns used by the app and migrations.
  - Enables RLS on all public tables.
  - Keeps public read access only for active products and TACO data.
  - Restricts admin operations to the configured Viva Leve admin emails.
*/

-- =============================================
-- Schema compatibility
-- =============================================
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now());

UPDATE public.produtos
SET created_at = COALESCE(created_at, criado_em, timezone('utc'::text, now()))
WHERE created_at IS NULL;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS endereco text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS total numeric NOT NULL DEFAULT 0;

UPDATE public.pedidos
SET
  created_at = COALESCE(created_at, criado_em, timezone('utc'::text, now())),
  criado_em = COALESCE(criado_em, created_at, timezone('utc'::text, now())),
  updated_at = COALESCE(updated_at, created_at, criado_em, timezone('utc'::text, now())),
  endereco = COALESCE(NULLIF(endereco, ''), endereco_entrega, ''),
  total = CASE WHEN total = 0 THEN COALESCE(valor_total, 0) ELSE total END
WHERE created_at IS NULL
  OR criado_em IS NULL
  OR updated_at IS NULL
  OR endereco = ''
  OR total = 0;

ALTER TABLE public.insumos
  ADD COLUMN IF NOT EXISTS unidade text NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS quantidade_estoque numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_unitario numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());

UPDATE public.insumos
SET
  unidade = COALESCE(NULLIF(unidade, ''), unidade_medida, 'un'),
  quantidade_estoque = COALESCE(NULLIF(quantidade_estoque, 0), estoque_atual, 0),
  created_at = COALESCE(created_at, timezone('utc'::text, now())),
  updated_at = COALESCE(updated_at, created_at, timezone('utc'::text, now()));

ALTER TABLE public.compras_insumos
  ADD COLUMN IF NOT EXISTS custo_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc'::text, now());

UPDATE public.compras_insumos
SET
  custo_total = COALESCE(NULLIF(custo_total, 0), valor_pago, 0),
  created_at = COALESCE(created_at, timezone('utc'::text, now())),
  updated_at = COALESCE(updated_at, created_at, timezone('utc'::text, now()));

CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON public.produtos(categoria);
CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON public.produtos(ativo);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON public.pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON public.pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado_em ON public.pedidos(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON public.pedidos(created_at DESC);

CREATE OR REPLACE FUNCTION public.update_pedidos_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_updated_at ON public.pedidos;
CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.update_pedidos_updated_at();

UPDATE public.pedidos
SET status = 'Concluído'
WHERE status IN ('Concluヴdo', 'ConcluÇðdo', 'Concluido');

-- =============================================
-- RLS enablement
-- =============================================
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diario_dieta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabela_taco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_refeicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_pedido ENABLE ROW LEVEL SECURITY;

-- =============================================
-- pedidos
-- =============================================
DROP POLICY IF EXISTS "Clients can view own pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Clients can insert own pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Authenticated users can update pedidos status" ON public.pedidos;
DROP POLICY IF EXISTS "Authenticated can read all pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Admins can read all pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Admins can update pedidos" ON public.pedidos;

CREATE POLICY "Clients can view own pedidos"
  ON public.pedidos FOR SELECT TO authenticated
  USING (auth.uid() = cliente_id);

CREATE POLICY "Clients can insert own pedidos"
  ON public.pedidos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = cliente_id);

CREATE POLICY "Admins can read all pedidos"
  ON public.pedidos FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'));

CREATE POLICY "Admins can update pedidos"
  ON public.pedidos FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'))
  WITH CHECK ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'));

-- =============================================
-- profiles and diet
-- =============================================
DROP POLICY IF EXISTS "Usuário lê próprio perfil" ON public.perfis;
DROP POLICY IF EXISTS "Usuário cria próprio perfil" ON public.perfis;
DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.perfis;
DROP POLICY IF EXISTS "Admin lê todos os perfis" ON public.perfis;
DROP POLICY IF EXISTS "Admins can read all perfis" ON public.perfis;

CREATE POLICY "Usuário lê próprio perfil"
  ON public.perfis FOR SELECT TO authenticated
  USING (auth.uid() = id OR (auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'));

CREATE POLICY "Usuário cria próprio perfil"
  ON public.perfis FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Usuário atualiza próprio perfil"
  ON public.perfis FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Usuário lê próprio endereço" ON public.perfis_clientes;
DROP POLICY IF EXISTS "Usuário cria próprio endereço" ON public.perfis_clientes;
DROP POLICY IF EXISTS "Usuário atualiza próprio endereço" ON public.perfis_clientes;
DROP POLICY IF EXISTS "Admins can read all perfis_clientes" ON public.perfis_clientes;

CREATE POLICY "Usuário lê próprio endereço"
  ON public.perfis_clientes FOR SELECT TO authenticated
  USING (auth.uid() = id OR (auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'));

CREATE POLICY "Usuário cria próprio endereço"
  ON public.perfis_clientes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Usuário atualiza próprio endereço"
  ON public.perfis_clientes FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Usuário lê próprio diário" ON public.diario_dieta;
DROP POLICY IF EXISTS "Usuário cria entrada no diário" ON public.diario_dieta;
DROP POLICY IF EXISTS "Usuário atualiza próprio diário" ON public.diario_dieta;
DROP POLICY IF EXISTS "Usuário apaga próprio diário" ON public.diario_dieta;

CREATE POLICY "Usuário lê próprio diário" ON public.diario_dieta FOR SELECT TO authenticated USING (auth.uid() = cliente_id);
CREATE POLICY "Usuário cria entrada no diário" ON public.diario_dieta FOR INSERT TO authenticated WITH CHECK (auth.uid() = cliente_id);
CREATE POLICY "Usuário atualiza próprio diário" ON public.diario_dieta FOR UPDATE TO authenticated USING (auth.uid() = cliente_id) WITH CHECK (auth.uid() = cliente_id);
CREATE POLICY "Usuário apaga próprio diário" ON public.diario_dieta FOR DELETE TO authenticated USING (auth.uid() = cliente_id);

-- =============================================
-- public reference/catalog tables
-- =============================================
DROP POLICY IF EXISTS "Public can read active produtos" ON public.produtos;
DROP POLICY IF EXISTS "Admins can read all produtos" ON public.produtos;
DROP POLICY IF EXISTS "Admins can insert produtos" ON public.produtos;
DROP POLICY IF EXISTS "Admins can update produtos" ON public.produtos;
DROP POLICY IF EXISTS "Admins can delete produtos" ON public.produtos;

CREATE POLICY "Public can read active produtos" ON public.produtos FOR SELECT TO anon, authenticated USING (ativo = true);
CREATE POLICY "Admins can read all produtos" ON public.produtos FOR SELECT TO authenticated USING ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'));
CREATE POLICY "Admins can insert produtos" ON public.produtos FOR INSERT TO authenticated WITH CHECK ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'));
CREATE POLICY "Admins can update produtos" ON public.produtos FOR UPDATE TO authenticated USING ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br')) WITH CHECK ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'));
CREATE POLICY "Admins can delete produtos" ON public.produtos FOR DELETE TO authenticated USING ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'));

DROP POLICY IF EXISTS "Public can read tabela_taco" ON public.tabela_taco;
CREATE POLICY "Public can read tabela_taco" ON public.tabela_taco FOR SELECT TO anon, authenticated USING (true);

-- =============================================
-- legacy and future tables
-- =============================================
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can read own profile" ON public.user_profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.user_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can read own diet" ON public.historico_refeicoes;
DROP POLICY IF EXISTS "Users can insert own diet" ON public.historico_refeicoes;
DROP POLICY IF EXISTS "Users can update own diet" ON public.historico_refeicoes;
DROP POLICY IF EXISTS "Users can delete own diet" ON public.historico_refeicoes;
CREATE POLICY "Users can read own diet" ON public.historico_refeicoes FOR SELECT TO authenticated USING (auth.uid() = cliente_id);
CREATE POLICY "Users can insert own diet" ON public.historico_refeicoes FOR INSERT TO authenticated WITH CHECK (auth.uid() = cliente_id);
CREATE POLICY "Users can update own diet" ON public.historico_refeicoes FOR UPDATE TO authenticated USING (auth.uid() = cliente_id) WITH CHECK (auth.uid() = cliente_id);
CREATE POLICY "Users can delete own diet" ON public.historico_refeicoes FOR DELETE TO authenticated USING (auth.uid() = cliente_id);

DROP POLICY IF EXISTS "Admins manage insumos" ON public.insumos;
DROP POLICY IF EXISTS "Admins manage compras_insumos" ON public.compras_insumos;
DROP POLICY IF EXISTS "Admins manage itens_pedido" ON public.itens_pedido;
CREATE POLICY "Admins manage insumos" ON public.insumos FOR ALL TO authenticated USING ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br')) WITH CHECK ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'));
CREATE POLICY "Admins manage compras_insumos" ON public.compras_insumos FOR ALL TO authenticated USING ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br')) WITH CHECK ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'));
CREATE POLICY "Admins manage itens_pedido" ON public.itens_pedido FOR ALL TO authenticated USING ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br')) WITH CHECK ((auth.jwt() ->> 'email') IN ('admin@vivaleve.com.br', 'dono@vivaleve.com.br', 'gerencia@vivaleve.com.br'));
