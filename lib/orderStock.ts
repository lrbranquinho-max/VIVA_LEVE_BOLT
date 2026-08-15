interface ItemPedidoEstoque {
  id?: string | number;
  quantidade?: string | number;
}

export async function validarEstoquePedido(supabase: any, itens: unknown) {
  if (!Array.isArray(itens) || itens.length === 0) throw new Error('O pedido nao possui produtos validos.');

  const quantidades = new Map<number, number>();
  for (const item of itens as ItemPedidoEstoque[]) {
    const produtoId = Number(item?.id);
    const quantidade = Number(item?.quantidade);
    if (!Number.isInteger(produtoId) || produtoId <= 0 || !Number.isFinite(quantidade) || quantidade <= 0) {
      throw new Error('O pedido possui um item invalido.');
    }
    quantidades.set(produtoId, (quantidades.get(produtoId) || 0) + quantidade);
  }

  const { data, error } = await supabase
    .from('produtos')
    .select('id,nome,estoque,ativo')
    .in('id', Array.from(quantidades.keys()));

  if (error) throw new Error(`Nao foi possivel validar o estoque: ${error.message}`);
  const produtos = new Map((data ?? []).map((produto: any) => [Number(produto.id), produto]));

  for (const [produtoId, quantidade] of Array.from(quantidades.entries())) {
    const produto: any = produtos.get(produtoId);
    if (!produto || !produto.ativo) throw new Error('Um produto do pedido nao esta mais disponivel.');
    if (Number(produto.estoque || 0) < quantidade) {
      throw new Error(`Estoque insuficiente para ${produto.nome}. Disponivel: ${Number(produto.estoque || 0)}.`);
    }
  }
}
