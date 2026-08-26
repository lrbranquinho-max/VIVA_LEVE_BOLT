export interface PlanoConfig {
  total_marmitas: number;
  entregas: number;
  marmitas_por_entrega: number;
  intervalo_dias: number;
  sabores_min: number;
  sabores_max: number;
  permite_voucher: boolean;
}
export interface SaborPlano { id: number; nome?: string; quantidade: number }
export interface EscolhaPlano { sabores: SaborPlano[]; primeira_data: string }
export interface ProdutoPlano {
  id: number; nome: string; descricao?: string | null; imagem_url?: string | null;
  preco: number; ativo: boolean; tipo_produto?: 'avulso' | 'kit';
  disponivel_kit?: boolean; plano_config?: PlanoConfig | null; categoria?: string;
}
export interface PlanosConfig { dias: number[]; antecedencia_dias: number; bandeiras: Record<string, boolean> }
export const DIAS_PLANO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const CONFIG_PLANO_INICIAL: PlanoConfig = { total_marmitas: 14, entregas: 2, marmitas_por_entrega: 7, intervalo_dias: 7, sabores_min: 3, sabores_max: 5, permite_voucher: true };
export const KITS_CARRINHO_KEY = 'viva-leve-kits-carrinho';
export function distribuirSabores(total: number, ids: number[]): SaborPlano[] {
  if (!Number.isInteger(total) || total < ids.length || !ids.length || new Set(ids).size !== ids.length) return [];
  return ids.map((id, index) => ({ id, quantidade: Math.floor(total / ids.length) + (index < total % ids.length ? 1 : 0) }));
}
export function validarEscolhaPlano(config: PlanoConfig, sabores: SaborPlano[]) {
  if (sabores.length < config.sabores_min) return `Escolha pelo menos ${config.sabores_min} tipos de marmitas diferentes para continuar.`;
  if (sabores.length > config.sabores_max) return `Escolha no máximo ${config.sabores_max} sabores.`;
  if (new Set(sabores.map(sabor => sabor.id)).size !== sabores.length) return 'Há sabores repetidos.';
  if (sabores.some(sabor => !Number.isInteger(sabor.quantidade) || sabor.quantidade < 1)) return 'Cada sabor deve ter ao menos uma marmita.';
  if (sabores.reduce((sum, sabor) => sum + sabor.quantidade, 0) !== config.total_marmitas) return `Selecione exatamente ${config.total_marmitas} marmitas.`;
  return '';
}
export function dataBrasilia(now = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(tipo => partes.find(p => p.type === tipo)!.value).join('-');
}
export function somarDias(data: string, dias: number) {
  const date = new Date(`${data}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dias);
  return date.toISOString().slice(0, 10);
}
export function datasPlano(primeira: string, config: PlanoConfig) {
  return Array.from({ length: config.entregas }, (_, index) => somarDias(primeira, config.intervalo_dias * index));
}
export function diaSemana(data: string) { return new Date(`${data}T12:00:00Z`).getUTCDay(); }
export function moedaPlano(valor: number) { return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
export function lerKitsCarrinho(): Record<number, EscolhaPlano> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(KITS_CARRINHO_KEY) || '{}'); } catch { return {}; }
}
