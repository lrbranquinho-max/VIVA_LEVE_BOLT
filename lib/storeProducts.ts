export interface ProdutoOrdenavelLoja {
  nome?: string | null;
  categoria?: string | null;
  tipo_produto?: 'avulso' | 'kit' | null;
}

function normalizarOrdenacao(valor: unknown) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
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
