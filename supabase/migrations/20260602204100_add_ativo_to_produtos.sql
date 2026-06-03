/*
  # Add ativo column to produtos table and create pedidos table

  1. Changes to produtos
    - Add `ativo` column (boolean, default true) for soft delete
    - Add `imagem_url` column for product image URL

  2. New Tables
    - `pedidos`
      - `id` (uuid, primary key)
      - `cliente_id` (uuid, references auth.users)
      - `endereco_entrega` (text)
      - `valor_total` (numeric)
      - `status` (text: 'Pendente', 'Em Preparo', 'Em Rota', 'Concluído', 'Cancelado')
      - `itens` (jsonb) - order items
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'produtos' AND column_name = 'ativo'
  ) THEN
    ALTER TABLE produtos ADD COLUMN ativo boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'produtos' AND column_name = 'imagem_url'
  ) THEN
    ALTER TABLE produtos ADD COLUMN imagem_url text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endereco_entrega text NOT NULL,
  valor_total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Pendente',
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente_id ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at DESC);

ALTER TABLE pedidos DISABLE ROW LEVEL SECURITY;
