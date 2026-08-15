export type MeioPagamentoConfiguravel = 'cielo' | 'mercado_pago' | 'pix';

export interface MeiosPagamentoConfig {
  cielo: boolean;
  mercado_pago: boolean;
  pix: boolean;
}

export const MEIOS_PAGAMENTO_PADRAO: MeiosPagamentoConfig = {
  cielo: true,
  mercado_pago: true,
  pix: true,
};

export function normalizarMeiosPagamento(valor: unknown): MeiosPagamentoConfig {
  const config = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>;
  const meios = (config.meios_pagamento && typeof config.meios_pagamento === 'object'
    ? config.meios_pagamento
    : {}) as Record<string, unknown>;

  return {
    cielo: typeof meios.cielo === 'boolean' ? meios.cielo : MEIOS_PAGAMENTO_PADRAO.cielo,
    mercado_pago: typeof meios.mercado_pago === 'boolean' ? meios.mercado_pago : MEIOS_PAGAMENTO_PADRAO.mercado_pago,
    pix: typeof meios.pix === 'boolean' ? meios.pix : MEIOS_PAGAMENTO_PADRAO.pix,
  };
}

export async function carregarMeiosPagamento(supabase: any): Promise<MeiosPagamentoConfig> {
  const { data, error } = await supabase
    .from('app_config')
    .select('valor')
    .eq('chave', 'loja_config')
    .maybeSingle();

  if (error) throw new Error(`Nao foi possivel consultar os meios de pagamento: ${error.message}`);
  return normalizarMeiosPagamento(data?.valor);
}

export async function meioPagamentoEstaAtivo(supabase: any, meio: MeioPagamentoConfiguravel) {
  const configuracao = await carregarMeiosPagamento(supabase);
  return configuracao[meio];
}
