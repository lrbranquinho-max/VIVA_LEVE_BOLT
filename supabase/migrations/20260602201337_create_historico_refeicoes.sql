/*
  # Create historico_refeicoes table for diet tracking

  1. New Tables
    - `historico_refeicoes`
      - `id` (uuid, primary key)
      - `cliente_id` (uuid, references auth.users)
      - `data_consumo` (date)
      - `tipo_refeicao` (text: 'Café da Manhã', 'Almoço', 'Lanche', 'Jantar')
      - `nome_alimento` (text)
      - `kcal` (numeric)
      - `proteinas` (numeric) - in grams
      - `carboidratos` (numeric) - in grams
      - `gorduras` (numeric) - in grams
      - `created_at` (timestamptz)

  2. Security
    - RLS disabled temporarily for development
    - Will be enabled after initial testing

  3. Notes
    - Tracks daily food intake per user
    - Linked to authenticated user via cliente_id
*/

CREATE TABLE IF NOT EXISTS historico_refeicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_consumo date DEFAULT CURRENT_DATE,
  tipo_refeicao text NOT NULL,
  nome_alimento text NOT NULL,
  kcal numeric DEFAULT 0,
  proteinas numeric DEFAULT 0,
  carboidratos numeric DEFAULT 0,
  gorduras numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historico_cliente_data
  ON historico_refeicoes(cliente_id, data_consumo);

ALTER TABLE historico_refeicoes DISABLE ROW LEVEL SECURITY;
