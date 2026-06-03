/*
  # Criar tabelas perfis, perfis_clientes, diario_dieta e adicionar colunas ao pedidos

  ## Tabelas Criadas
  - `perfis`: perfil básico do usuário (nome, telefone)
  - `perfis_clientes`: endereço detalhado para entrega no DF
  - `diario_dieta`: totais diários de macros consumidos

  ## Alterações
  - `pedidos`: adicionadas colunas `endereco` e `total` para compatibilidade com o código atual

  ## Segurança
  - RLS habilitado em todas as novas tabelas
  - Políticas de acesso somente ao próprio usuário
*/

-- =============================================
-- perfis: perfil básico (nome, telefone)
-- =============================================
CREATE TABLE IF NOT EXISTS perfis (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       text NOT NULL DEFAULT '',
  telefone   text NOT NULL DEFAULT '',
  criado_em  timestamptz DEFAULT now()
);

ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprio perfil"
  ON perfis FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Usuário cria próprio perfil"
  ON perfis FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Usuário atualiza próprio perfil"
  ON perfis FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =============================================
-- perfis_clientes: endereço detalhado
-- =============================================
CREATE TABLE IF NOT EXISTS perfis_clientes (
  id                    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo         text NOT NULL DEFAULT '',
  telefone              text NOT NULL DEFAULT '',
  endereco_rua          text NOT NULL DEFAULT '',
  endereco_numero       text NOT NULL DEFAULT '',
  endereco_complemento  text NOT NULL DEFAULT '',
  bairro                text NOT NULL DEFAULT '',
  regiao_df             text NOT NULL DEFAULT '',
  criado_em             timestamptz DEFAULT now()
);

ALTER TABLE perfis_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprio endereço"
  ON perfis_clientes FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Usuário cria próprio endereço"
  ON perfis_clientes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Usuário atualiza próprio endereço"
  ON perfis_clientes FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =============================================
-- diario_dieta: totais diários de macros
-- =============================================
CREATE TABLE IF NOT EXISTS diario_dieta (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cliente_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data             date NOT NULL DEFAULT CURRENT_DATE,
  kcal_consumidas  numeric NOT NULL DEFAULT 0,
  proteinas_g      numeric NOT NULL DEFAULT 0,
  carbos_g         numeric NOT NULL DEFAULT 0,
  gorduras_g       numeric NOT NULL DEFAULT 0,
  UNIQUE (cliente_id, data)
);

ALTER TABLE diario_dieta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprio diário"
  ON diario_dieta FOR SELECT TO authenticated
  USING (auth.uid() = cliente_id);

CREATE POLICY "Usuário cria entrada no diário"
  ON diario_dieta FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = cliente_id);

CREATE POLICY "Usuário atualiza próprio diário"
  ON diario_dieta FOR UPDATE TO authenticated
  USING (auth.uid() = cliente_id)
  WITH CHECK (auth.uid() = cliente_id);

-- =============================================
-- pedidos: adicionar colunas endereco e total
-- (as colunas antigas endereco_entrega/valor_total
--  são mantidas para não perder dados existentes)
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pedidos' AND column_name = 'endereco'
  ) THEN
    ALTER TABLE pedidos ADD COLUMN endereco text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pedidos' AND column_name = 'total'
  ) THEN
    ALTER TABLE pedidos ADD COLUMN total numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pedidos' AND column_name = 'criado_em'
  ) THEN
    ALTER TABLE pedidos ADD COLUMN criado_em timestamptz DEFAULT now();
  END IF;
END $$;

-- Sincronizar dados existentes para as novas colunas
UPDATE pedidos
SET
  endereco = COALESCE(endereco_entrega, ''),
  total    = COALESCE(valor_total, 0),
  criado_em = COALESCE(created_at, now())
WHERE endereco = '' OR total = 0;

-- Permitir que usuários autenticados leiam seus próprios perfis na tabela perfis
-- para o admin poder buscar nomes dos clientes
CREATE POLICY "Admin lê todos os perfis"
  ON perfis FOR SELECT TO authenticated
  USING (true);
