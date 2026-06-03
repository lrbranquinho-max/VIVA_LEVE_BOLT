/*
  # Create produtos table

  1. New Tables
    - `produtos`
      - `id` (int, primary key, auto-increment)
      - `nome` (text) - Product name
      - `descricao` (text) - Product description
      - `preco` (numeric) - Product price
      - `categoria` (text) - Product category
      - `estoque` (int) - Stock quantity
      - `kcal` (numeric) - Calories
      - `proteinas` (numeric) - Proteins in grams
      - `carboidratos` (numeric) - Carbs in grams
      - `gorduras` (numeric) - Fats in grams
      - `created_at` (timestamptz)

  2. Notes
    - Table for store menu items
    - Includes nutritional info for diet tracking
    - RLS disabled for public access to products
*/

CREATE TABLE IF NOT EXISTS produtos (
  id SERIAL PRIMARY KEY,
  nome text NOT NULL,
  descricao text DEFAULT '',
  preco numeric NOT NULL DEFAULT 0,
  categoria text DEFAULT 'Outros',
  estoque integer DEFAULT 0,
  kcal numeric DEFAULT 0,
  proteinas numeric DEFAULT 0,
  carboidratos numeric DEFAULT 0,
  gorduras numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE produtos DISABLE ROW LEVEL SECURITY;

-- Insert sample products
INSERT INTO produtos (nome, descricao, preco, categoria, estoque, kcal, proteinas, carboidratos, gorduras) VALUES
('Marmita Frango Integral', 'Frango grelhado com batata doce e brócolis', 29.90, 'Almoço', 10, 450, 45, 35, 8),
('Salada Proteica', 'Alface, frango, ovos e azeite de oliva', 24.90, 'Almoço', 8, 280, 35, 12, 10),
('Bowl Açaí com Granola', 'Açaí puro com granola caseira e frutas vermelhas', 18.90, 'Café da Manhã', 15, 320, 12, 42, 8),
('Vitamina Protein', 'Whey protein, banana e leite desnatado', 16.90, 'Café da Manhã', 12, 240, 30, 18, 2),
('Fruta do Dia', 'Maçã, banana ou morango (seasonal)', 8.90, 'Lanche', 20, 80, 1, 20, 0),
('Bolo Fit de Chocolate', 'Bolo integral com chocolate 70%', 14.90, 'Lanche', 10, 210, 8, 25, 6),
('Marmita Vegana', 'Grão de bico, quinoa, cenoura e abóbora', 26.90, 'Almoço', 7, 380, 18, 52, 5),
('Sanduíche Natural', 'Peito de frango, queijo branco e alface', 15.90, 'Lanche', 12, 320, 32, 28, 6),
('Peixe com Arroz Integral', 'Salmão ao forno com arroz integral e legumes', 34.90, 'Almoço', 6, 520, 52, 38, 12),
('Sopa de Legumes', 'Sopa caseira com diversos legumes frescos', 12.90, 'Lanche', 10, 150, 8, 20, 2);
