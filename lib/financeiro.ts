export type TipoFinanceiro = 'insumo' | 'operacional' | 'investimento';
export type StatusFinanceiro = 'pendente' | 'pago' | 'cancelado';
export type FormaPagamentoFinanceira =
  | 'pix'
  | 'dinheiro'
  | 'cartao_debito'
  | 'cartao_credito'
  | 'boleto'
  | 'transferencia'
  | 'outro';

export interface CategoriaFinanceira {
  id: string;
  tipo: TipoFinanceiro;
  nome: string;
  ativo: boolean;
}

export interface CentroCustoFinanceiro {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface FornecedorFinanceiro {
  id: string;
  nome_razao_social: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  observacao: string | null;
  ativo: boolean;
}

export interface LancamentoFinanceiro {
  id: string;
  tipo: TipoFinanceiro;
  categoria_id: string;
  centro_custo_id: string | null;
  fornecedor_id: string | null;
  descricao: string;
  numero_documento: string | null;
  data_compra: string;
  valor_total: number;
  forma_pagamento: FormaPagamentoFinanceira | null;
  condicao_pagamento: 'avista' | 'parcelado';
  quantidade_parcelas: number;
  status: StatusFinanceiro;
  observacoes: string | null;
  anexo_path: string | null;
  recorrente: boolean;
  frequencia_recorrencia: 'semanal' | 'mensal' | 'anual' | null;
  categoria?: CategoriaFinanceira | null;
  centro_custo?: CentroCustoFinanceiro | null;
  fornecedor?: FornecedorFinanceiro | null;
}

export interface ParcelaFinanceira {
  id: string;
  lancamento_id: string;
  numero_parcela: number;
  total_parcelas: number;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  forma_pagamento: FormaPagamentoFinanceira | null;
  status: StatusFinanceiro;
  lancamento?: LancamentoFinanceiro | null;
}

export interface ReceitaFinanceira {
  pedido_id: number;
  data_recebimento: string;
  valor: number;
  meio_pagamento: string | null;
  pagamento_status: string;
  status_pedido: string;
}

export const TIPOS_FINANCEIROS: Array<{ value: TipoFinanceiro; label: string }> = [
  { value: 'insumo', label: 'Insumos' },
  { value: 'operacional', label: 'Despesa operacional' },
  { value: 'investimento', label: 'Investimento' },
];

export const FORMAS_PAGAMENTO_FINANCEIRO: Array<{ value: FormaPagamentoFinanceira; label: string }> = [
  { value: 'pix', label: 'Pix' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'outro', label: 'Outro' },
];

export const moedaBR = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarMoeda(valor: number) {
  return moedaBR.format(Number(valor) || 0);
}

export function formatarData(data?: string | null) {
  if (!data) return '-';
  const valor = data.length === 10 ? `${data}T12:00:00` : data;
  return new Intl.DateTimeFormat('pt-BR').format(new Date(valor));
}

export function dataISO(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function normalizarValorBR(valor: string) {
  const limpo = valor.replace(/[^\d,.-]/g, '').trim();
  if (!limpo) return 0;
  if (limpo.includes(',')) return Number(limpo.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(limpo) || 0;
}

export function nomeTipo(tipo: TipoFinanceiro) {
  return TIPOS_FINANCEIROS.find(item => item.value === tipo)?.label ?? tipo;
}

export function nomeForma(forma?: FormaPagamentoFinanceira | null) {
  if (!forma) return 'Não informada';
  return FORMAS_PAGAMENTO_FINANCEIRO.find(item => item.value === forma)?.label ?? forma;
}

export function inicioDoDia(data: Date) {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

export function fimDoDia(data: Date) {
  const copia = new Date(data);
  copia.setHours(23, 59, 59, 999);
  return copia;
}

export function intervaloFinanceiro(
  periodo: 'hoje' | '7dias' | 'mes' | 'mes_anterior' | 'personalizado',
  personalizadoInicio?: string,
  personalizadoFim?: string,
) {
  const hoje = new Date();
  let inicio = inicioDoDia(hoje);
  let fim = fimDoDia(hoje);

  if (periodo === '7dias') {
    inicio.setDate(inicio.getDate() - 6);
  } else if (periodo === 'mes') {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  } else if (periodo === 'mes_anterior') {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59, 999);
  } else if (periodo === 'personalizado' && personalizadoInicio && personalizadoFim) {
    inicio = inicioDoDia(new Date(`${personalizadoInicio}T12:00:00`));
    fim = fimDoDia(new Date(`${personalizadoFim}T12:00:00`));
  }

  return { inicio, fim };
}
