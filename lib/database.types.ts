export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
          criado_em?: string | null;
        };
      };
    };
  };
};
