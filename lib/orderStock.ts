import { resolverDataLiberacaoVendas } from './storeLaunch';
import { criarSupabaseAdmin } from './supabaseAdmin';

interface ItemPedidoEstoque {
  id?: string | number;
  quantidade?: string | number;
}

export async function validarLiberacaoVendas(supabase: any) {
  const { data, error } = await supabase
    .from('app_config')
    .select('valor')
    .eq('chave', 'loja_config')
    .maybeSingle();

  if (error) throw new Error(`Nao foi possivel validar a liberacao das vendas: ${error.message}`);

  const dataLiberacao = resolverDataLiberacaoVendas(data?.valor);
  if (Date.now() < Date.parse(dataLiberacao)) {
    throw new Error('As vendas estarao disponiveis a partir de 01/09/2026.');
  }
}

export async function validarEstoquePedido(supabase: any, itens: unknown, pedidoId?: string | number, meio?: string) {
  await validarLiberacaoVendas(supabase);
  let plano = false;
  if (pedidoId !== undefined) {
    const { data: pedido, error } = await supabase.from('pedidos').select('plano_id,status,pagamento_status,checkout_idempotencia').eq('id', pedidoId).single();
    if (error) throw error;
    if (pedido.plano_id) throw new Error('Esta entrega já pertence a uma cobrança. Pague o pedido principal.');
    plano = Boolean(pedido.checkout_idempotencia);
    if (pedido.status === 'Cancelado' || pedido.pagamento_status === 'approved') throw new Error('Pedido cancelado ou já pago.');
    const { data: cancelados, error: planoError } = await supabase.from('planos_marmitas').select('id').eq('pedido_id', pedidoId).eq('status', 'Cancelado').limit(1);
    if (planoError) throw planoError;
    if (cancelados?.length) throw new Error('Pedido com plano cancelado. Contate a administração.');
  }
  if (!Array.isArray(itens) || itens.length === 0) throw new Error('O pedido nao possui produtos validos.');

  const quantidades = new Map<number, number>();
  for (const item of itens as ItemPedidoEstoque[]) {
    const produtoId = Number(item?.id);
    const quantidade = Number(item?.quantidade);
    if (!Number.isInteger(produtoId) || produtoId <= 0 || !Number.isInteger(quantidade) || quantidade <= 0) {
      throw new Error('O pedido possui um item invalido.');
    }
    quantidades.set(produtoId, (quantidades.get(produtoId) || 0) + quantidade);
  }

  const { data, error } = await supabase
    .from('produtos')
    .select('id,nome,estoque,ativo,tipo_produto')
    .in('id', Array.from(quantidades.keys()));

  if (error) throw new Error(`Nao foi possivel validar o estoque: ${error.message}`);
  const produtos = new Map((data ?? []).map((produto: any) => [Number(produto.id), produto]));

  for (const [produtoId, quantidade] of Array.from(quantidades.entries())) {
    const produto: any = produtos.get(produtoId);
    if (!produto || !produto.ativo) throw new Error('Um produto do pedido nao esta mais disponivel.');
    if (produto.tipo_produto !== 'kit' && Number(produto.estoque || 0) < quantidade) {
      throw new Error(`Estoque insuficiente para ${produto.nome}. Disponivel: ${Number(produto.estoque || 0)}.`);
    }
  }
  if (plano && meio && pedidoId !== undefined) {
    const { error } = await criarSupabaseAdmin().rpc('preparar_pagamento_plano', { p_pedido_id: pedidoId, p_meio: meio });
    if (error) throw error;
  }
}
