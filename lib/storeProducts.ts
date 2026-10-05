export interface ProdutoOrdenavelLoja {
  nome?: string | null;
  categoria?: string | null;
  tipo_produto?: 'avulso' | 'kit' | null;
}

export interface ProdutoNutricionalLoja extends ProdutoOrdenavelLoja {
  porcao_g?: number | string | null;
  kcal?: number | string | null;
  proteinas?: number | string | null;
  carboidratos?: number | string | null;
  gorduras?: number | string | null;
}

export interface ValoresNutricionaisExibicao {
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  referentePorcaoTotal: boolean;
}

function normalizarOrdenacao(valor: unknown) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function valoresNutricionaisParaExibicao(produto?: ProdutoNutricionalLoja | null): ValoresNutricionaisExibicao {
  const categoria = normalizarOrdenacao(produto?.categoria);
  const porcaoG = Number(produto?.porcao_g ?? 0);
  const referentePorcaoTotal = produto?.tipo_produto !== 'kit'
    && (categoria === 'marmitas' || categoria === 'caldos')
    && Number.isFinite(porcaoG)
    && porcaoG > 0;
  const fator = referentePorcaoTotal ? porcaoG / 100 : 1;
  const calcular = (valor: number | string | null | undefined) => {
    const numero = Number(valor ?? 0);
    return (Number.isFinite(numero) ? numero : 0) * fator;
  };

  return {
    kcal: calcular(produto?.kcal),
    proteinas: calcular(produto?.proteinas),
    carboidratos: calcular(produto?.carboidratos),
    gorduras: calcular(produto?.gorduras),
    referentePorcaoTotal,
  };
}

export function ordenarProdutosLoja<T extends ProdutoOrdenavelLoja>(lista: T[]) {
  const prioridade = (produto: T) => {
    if (produto.tipo_produto === 'kit') return 0;
    if (normalizarOrdenacao(produto.categoria) === 'marmitas') return 1;
    return 2;
  };

  return [...lista].sort((a, b) =>
    prioridade(a) - prioridade(b)
    || normalizarOrdenacao(a.categoria).localeCompare(normalizarOrdenacao(b.categoria), 'pt-BR')
    || String(a.nome ?? '').localeCompare(String(b.nome ?? ''), 'pt-BR')
  );
}
