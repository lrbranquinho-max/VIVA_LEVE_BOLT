export const STORE_TIME_ZONE = 'America/Sao_Paulo';
// Sales are open. Keeping a past fallback also prevents stale clients from
// recreating the former launch gate when the configuration cannot be loaded.
export const DEFAULT_STORE_LAUNCH_AT = '2020-01-01T00:00:00-03:00';

export interface StoreLaunchConfig {
  data_liberacao_vendas?: unknown;
}

export function resolverDataLiberacaoVendas(config?: StoreLaunchConfig | null) {
  const configurada = typeof config?.data_liberacao_vendas === 'string'
    ? config.data_liberacao_vendas.trim()
    : '';
  const candidata = configurada || DEFAULT_STORE_LAUNCH_AT;

  return Number.isNaN(Date.parse(candidata)) ? DEFAULT_STORE_LAUNCH_AT : candidata;
}

export function vendasDaLojaLiberadas(config?: StoreLaunchConfig | null, agora = Date.now()) {
  return agora >= Date.parse(resolverDataLiberacaoVendas(config));
}

export function formatarDataLiberacaoCurta(config?: StoreLaunchConfig | null) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: STORE_TIME_ZONE,
  }).format(new Date(resolverDataLiberacaoVendas(config)));
}
