/*
  # Create tabela_taco for nutritional food database

  1. New Tables
    - `tabela_taco`
      - `id` (bigint, primary key)
      - `nome_alimento` (text) - Food name
      - `kcal_100g` (integer) - Calories per 100g
      - `carboidratos_100g` (numeric) - Carbs per 100g
      - `proteinas_100g` (numeric) - Proteins per 100g
      - `gorduras_100g` (numeric) - Fats per 100g

  2. Notes
    - TACO (Tabela Brasileira de Composicao de Alimentos) reference table
    - Values are per 100g, so autocomplete will apply proportional calculation
    - RLS disabled - public read access needed for autocomplete search
    - Seeded with 60 common Brazilian foods
*/

CREATE TABLE IF NOT EXISTS tabela_taco (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nome_alimento text NOT NULL,
  kcal_100g integer NOT NULL DEFAULT 0,
  carboidratos_100g numeric NOT NULL DEFAULT 0,
  proteinas_100g numeric NOT NULL DEFAULT 0,
  gorduras_100g numeric NOT NULL DEFAULT 0
);

ALTER TABLE tabela_taco DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tabela_taco_nome ON tabela_taco USING gin(to_tsvector('portuguese', nome_alimento));
CREATE INDEX IF NOT EXISTS idx_tabela_taco_nome_like ON tabela_taco(nome_alimento);

INSERT INTO tabela_taco (nome_alimento, kcal_100g, carboidratos_100g, proteinas_100g, gorduras_100g) VALUES
('Arroz branco cozido', 128, 28.1, 2.5, 0.2),
('Arroz integral cozido', 124, 25.8, 2.6, 1.0),
('Feijão carioca cozido', 76, 13.6, 4.5, 0.5),
('Feijão preto cozido', 77, 14.0, 4.5, 0.5),
('Frango peito grelhado', 159, 0.0, 32.0, 3.2),
('Frango coxa cozida', 180, 0.0, 26.0, 8.0),
('Carne bovina patinho', 219, 0.0, 30.4, 10.7),
('Carne bovina filé mignon', 218, 0.0, 31.0, 10.4),
('Ovo inteiro cozido', 146, 0.6, 13.3, 9.5),
('Clara de ovo cozida', 52, 0.8, 10.9, 0.0),
('Leite integral', 61, 4.7, 3.2, 3.3),
('Leite desnatado', 35, 5.0, 3.5, 0.1),
('Iogurte natural integral', 61, 4.9, 3.5, 3.1),
('Queijo minas frescal', 264, 3.2, 17.4, 20.2),
('Batata doce cozida', 77, 18.4, 1.4, 0.1),
('Batata inglesa cozida', 52, 11.9, 1.2, 0.1),
('Mandioca cozida', 125, 30.1, 0.6, 0.2),
('Inhame cozido', 95, 22.3, 1.3, 0.1),
('Macarrão cozido', 111, 22.6, 4.0, 0.7),
('Pão francês', 300, 57.6, 8.0, 3.1),
('Pão integral', 253, 46.3, 8.0, 3.5),
('Aveia em flocos', 394, 66.6, 13.9, 8.5),
('Banana nanica', 92, 23.8, 1.3, 0.1),
('Maçã', 56, 15.2, 0.3, 0.1),
('Laranja pera', 37, 8.9, 1.0, 0.1),
('Mamão papaia', 40, 10.4, 0.5, 0.1),
('Abacaxi', 48, 12.3, 0.9, 0.1),
('Manga Tommy', 64, 17.0, 0.4, 0.1),
('Uva itália', 69, 17.9, 0.7, 0.0),
('Melancia', 33, 8.1, 0.9, 0.1),
('Abacate', 96, 6.0, 1.2, 8.4),
('Alface crespa crua', 11, 1.7, 1.3, 0.2),
('Tomate cru', 15, 3.1, 1.1, 0.2),
('Cenoura crua', 34, 7.7, 1.3, 0.2),
('Beterraba cozida', 35, 8.0, 1.7, 0.1),
('Brócolis cozido', 25, 2.7, 3.8, 0.4),
('Espinafre cozido', 24, 3.1, 3.0, 0.3),
('Couve refogada', 52, 7.1, 4.4, 0.5),
('Chuchu cozido', 20, 4.5, 0.5, 0.2),
('Abobrinha cozida', 18, 3.7, 1.2, 0.2),
('Abóbora moranga cozida', 22, 5.2, 0.7, 0.1),
('Peixe tilápia grelhada', 96, 0.0, 20.1, 2.2),
('Peixe salmão grelhado', 209, 0.0, 25.1, 11.4),
('Atum em lata', 133, 0.0, 29.9, 1.5),
('Camarão cozido', 89, 0.0, 18.7, 1.2),
('Whey protein', 400, 10.0, 80.0, 5.0),
('Amendoim torrado', 567, 21.5, 24.4, 45.1),
('Castanha do Pará', 656, 15.1, 14.5, 63.5),
('Azeite de oliva', 884, 0.0, 0.0, 100.0),
('Manteiga', 726, 0.1, 0.4, 81.0),
('Granola', 408, 66.5, 9.3, 12.4),
('Açúcar branco', 387, 99.5, 0.0, 0.0),
('Mel', 309, 84.0, 0.3, 0.0),
('Chocolate 70% cacau', 598, 45.9, 8.1, 42.6),
('Quinoa cozida', 120, 21.3, 4.4, 1.9),
('Lentilha cozida', 93, 15.6, 7.8, 0.4),
('Grão de bico cozido', 150, 22.5, 9.0, 2.6),
('Milho cozido', 85, 18.7, 3.2, 1.0),
('Tofu', 68, 2.7, 7.2, 3.8),
('Cream cheese', 350, 3.8, 6.2, 34.9);
