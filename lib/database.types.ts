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
      admin_usuario_roles: {
        Row: {
          email: string;
          role: 'admin' | 'trainer' | 'delivery';
          nome: string;
          ativo: boolean;
          user_id: string | null;
          telefone: string | null;
          observacoes: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          email: string;
          role: 'admin' | 'trainer' | 'delivery';
          nome?: string;
          ativo?: boolean;
          user_id?: string | null;
          telefone?: string | null;
          observacoes?: string | null;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          nome?: string;
          ativo?: boolean;
          user_id?: string | null;
          telefone?: string | null;
          observacoes?: string | null;
          atualizado_em?: string;
        };
      };
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
      creditos_pagamento: {
        Row: {
          id: number;
          chave: string;
          valor_origem: number;
          valor_disponivel: number;
          valor_reservado: number;
          tipo: 'Devolução' | 'Bonificação' | 'Premiação' | 'Venda Externa';
          email_restricao: string | null;
          ativo: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: number;
          chave: string;
          valor_origem: number;
          valor_disponivel?: number;
          valor_reservado?: number;
          tipo: 'Devolução' | 'Bonificação' | 'Premiação' | 'Venda Externa';
          email_restricao?: string | null;
          ativo?: boolean;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: {
          chave?: string;
          valor_origem?: number;
          valor_disponivel?: number;
          valor_reservado?: number;
          tipo?: 'Devolução' | 'Bonificação' | 'Premiação' | 'Venda Externa';
          email_restricao?: string | null;
          ativo?: boolean;
          atualizado_em?: string;
        };
      };
      financeiro_categorias: {
        Row: { id: string; tipo: 'insumo' | 'operacional' | 'investimento'; nome: string; ativo: boolean; criado_em: string; atualizado_em: string };
        Insert: { id?: string; tipo: 'insumo' | 'operacional' | 'investimento'; nome: string; ativo?: boolean; criado_em?: string; atualizado_em?: string };
        Update: { tipo?: 'insumo' | 'operacional' | 'investimento'; nome?: string; ativo?: boolean; atualizado_em?: string };
      };
      financeiro_centros_custo: {
        Row: { id: string; nome: string; ativo: boolean; criado_em: string; atualizado_em: string };
        Insert: { id?: string; nome: string; ativo?: boolean; criado_em?: string; atualizado_em?: string };
        Update: { nome?: string; ativo?: boolean; atualizado_em?: string };
      };
      financeiro_fornecedores: {
        Row: { id: string; nome_razao_social: string; cpf_cnpj: string | null; telefone: string | null; observacao: string | null; ativo: boolean; criado_em: string; atualizado_em: string };
        Insert: { id?: string; nome_razao_social: string; cpf_cnpj?: string | null; telefone?: string | null; observacao?: string | null; ativo?: boolean; criado_em?: string; atualizado_em?: string };
        Update: { nome_razao_social?: string; cpf_cnpj?: string | null; telefone?: string | null; observacao?: string | null; ativo?: boolean; atualizado_em?: string };
      };
      financeiro_lancamentos: {
        Row: {
          id: string; tipo: 'insumo' | 'operacional' | 'investimento'; categoria_id: string; centro_custo_id: string | null;
          fornecedor_id: string | null; descricao: string; numero_documento: string | null; data_compra: string; valor_total: number;
          forma_pagamento: 'pix' | 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'boleto' | 'transferencia' | 'outro' | null;
          condicao_pagamento: 'avista' | 'parcelado'; quantidade_parcelas: number; status: 'pendente' | 'pago' | 'cancelado';
          observacoes: string | null; anexo_path: string | null; recorrente: boolean; frequencia_recorrencia: 'semanal' | 'mensal' | 'anual' | null;
          proxima_recorrencia: string | null; insumo_id: number | null; quantidade_insumo: number | null; custo_unitario: number | null;
          criado_por: string; criado_em: string; atualizado_em: string;
        };
        Insert: {
          id?: string; tipo: 'insumo' | 'operacional' | 'investimento'; categoria_id: string; centro_custo_id?: string | null;
          fornecedor_id?: string | null; descricao: string; numero_documento?: string | null; data_compra?: string; valor_total: number;
          forma_pagamento?: 'pix' | 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'boleto' | 'transferencia' | 'outro' | null;
          condicao_pagamento?: 'avista' | 'parcelado'; quantidade_parcelas?: number; status?: 'pendente' | 'pago' | 'cancelado';
          observacoes?: string | null; anexo_path?: string | null; recorrente?: boolean; frequencia_recorrencia?: 'semanal' | 'mensal' | 'anual' | null;
          proxima_recorrencia?: string | null; insumo_id?: number | null; quantidade_insumo?: number | null; custo_unitario?: number | null;
          criado_por?: string; criado_em?: string; atualizado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['financeiro_lancamentos']['Insert']>;
      };
      financeiro_parcelas: {
        Row: {
          id: string; lancamento_id: string; numero_parcela: number; total_parcelas: number; valor: number; data_vencimento: string;
          data_pagamento: string | null; forma_pagamento: 'pix' | 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'boleto' | 'transferencia' | 'outro' | null;
          status: 'pendente' | 'pago' | 'cancelado'; pago_por: string | null; criado_em: string; atualizado_em: string;
        };
        Insert: {
          id?: string; lancamento_id: string; numero_parcela: number; total_parcelas: number; valor: number; data_vencimento: string;
          data_pagamento?: string | null; forma_pagamento?: 'pix' | 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'boleto' | 'transferencia' | 'outro' | null;
          status?: 'pendente' | 'pago' | 'cancelado'; pago_por?: string | null; criado_em?: string; atualizado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['financeiro_parcelas']['Insert']>;
      };
      entregas_historico: {
        Row: {
          id: number;
          pedido_id: number;
          evento: 'atribuido' | 'reatribuido' | 'atribuicao_removida' | 'saiu_para_entrega' | 'entregue' | 'status_alterado' | 'tentativa_codigo_invalido';
          status_anterior: string | null;
          status_novo: string | null;
          entregador_anterior_id: string | null;
          entregador_novo_id: string | null;
          ator_id: string | null;
          ator_tipo: 'admin' | 'delivery' | 'client' | 'system';
          metodo_confirmacao: string | null;
          detalhes: Json;
          criado_em: string;
        };
        Insert: never;
        Update: never;
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
          estoque_reservado: number;
          estoque_disponivel: number;
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
          estoque_reservado?: number;
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
          estoque_reservado?: number;
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
