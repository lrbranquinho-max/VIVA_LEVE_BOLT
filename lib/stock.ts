export interface ProdutoComEstoque {
  estoque?: number | string | null;
  estoque_reservado?: number | string | null;
  estoque_disponivel?: number | string | null;
}

export function estoqueDisponivelProduto(produto: ProdutoComEstoque | null | undefined) {
  if (!produto) return 0;
  const calculado = produto.estoque_disponivel ?? (Number(produto.estoque ?? 0) - Number(produto.estoque_reservado ?? 0));
  return Math.max(Number(calculado) || 0, 0);
}
