export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TabelaNutricional = {
  porcao_g: number;
  valor_energetico_kcal: number;
  carboidratos_g: number;
  proteinas_g: number;
  gorduras_totais_g: number;
  gorduras_saturadas_g: number;
  gorduras_trans_g: number;
  fibra_alimentar_g: number;
  sodio_mg: number;
  ingredientes: string;
  alergicos: string;
};

export type Database = {
  public: {
    Tables: {
      app_config: {
        Row: {
          chave: string;
          valor: Json;
          atualizado_em: string;
        };
        Insert: {
          chave: string;
          valor?: Json;
          atualizado_em?: string;
        };
        Update: {
          chave?: string;
          valor?: Json;
          atualizado_em?: string;
        };
      };
      produtos: {
        Row: {
          id: number;
          nome: string;
          descricao: string | null;
          preco: number;
          categoria: string;
          imagem_url: string | null;
          estoque: number;
          kcal: number | null;
          carboidratos: number | null;
          proteinas: number | null;
          gorduras: number | null;
          porcao_g: number | null;
          ativo: boolean;
          criado_em: string;
          created_at: string | null;
          tabela_nutri: TabelaNutricional | null;
        };
        Insert: {
          id?: number;
          nome: string;
          descricao?: string | null;
          preco: number;
          categoria: string;
          imagem_url?: string | null;
          estoque?: number;
          kcal?: number | null;
          carboidratos?: number | null;
          proteinas?: number | null;
          gorduras?: number | null;
          porcao_g?: number | null;
          ativo?: boolean;
          criado_em?: string;
          created_at?: string | null;
          tabela_nutri?: TabelaNutricional | null;
        };
        Update: {
          id?: number;
          nome?: string;
          descricao?: string | null;
          preco?: number;
          categoria?: string;
          imagem_url?: string | null;
          estoque?: number;
          kcal?: number | null;
          carboidratos?: number | null;
          proteinas?: number | null;
          gorduras?: number | null;
          porcao_g?: number | null;
          ativo?: boolean;
          criado_em?: string;
          created_at?: string | null;
          tabela_nutri?: TabelaNutricional | null;
        };
      };
      receitas_externas: {
        Row: {
          id: string;
          tipo_refeicao: 'Cafe da Manha' | 'Lanche' | 'Almoco_Jantar' | 'Ceia';
          nome_receita: string;
          modo_preparo: string | null;
          kcal_100g: number | null;
          carb_100g: number | null;
          prot_100g: number | null;
          gord_100g: number | null;
          porcao: number | null;
          criado_em: string | null;
        };
        Insert: {
          id?: string;
          tipo_refeicao: 'Cafe da Manha' | 'Lanche' | 'Almoco_Jantar' | 'Ceia';
          nome_receita: string;
          modo_preparo?: string | null;
          kcal_100g?: number | null;
          carb_100g?: number | null;
          prot_100g?: number | null;
          gord_100g?: number | null;
          porcao: number;
          criado_em?: string | null;
        };
        Update: {
          id?: string;
          tipo_refeicao?: 'Cafe da Manha' | 'Lanche' | 'Almoco_Jantar' | 'Ceia';
          nome_receita?: string;
          modo_preparo?: string | null;
          kcal_100g?: number | null;
          carb_100g?: number | null;
          prot_100g?: number | null;
          gord_100g?: number | null;
          porcao?: number | null;
          criado_em?: string | null;
        };
      };
    };
  };
};
