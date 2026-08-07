import MercadoPagoConfig, { Payment } from 'mercadopago';
import { criarSupabaseAdmin } from './supabaseAdmin';

interface ItemPedido {
  id?: number;
  quantidade?: number;
}

export function statusPedidoMercadoPago(statusPagamento: string) {
  return statusPagamento === 'approved' ? 'Em Preparo' :
    statusPagamento === 'pending' || statusPagamento === 'in_process' ? 'Aguardando Pagamento' :
    statusPagamento === 'rejected' || statusPagamento === 'cancelled' ? 'Pagamento Recusado' :
    'Aguardando Pagamento';
}

export async function processarPagamentoPedidoMercadoPago(
  supabase: ReturnType<typeof criarSupabaseAdmin>,
  pedidoId: string,
  paymentId: string,
  statusPagamento: string,
  statusPedido: string,
  statusDetail?: string | null,
) {
  const { error: rpcError } = await supabase.rpc('processar_pagamento_pedido_mp', {
    p_pedido_id: pedidoId,
    p_payment_id: paymentId,
    p_pagamento_status: statusPagamento,
    p_status_pedido: statusPedido,
  });

  if (!rpcError) {
    const { error: detailError } = await supabase
      .from('pedidos')
      .update({
        mercado_pago_status_detail: statusDetail || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pedidoId);

    if (detailError) throw detailError;
    return;
  }
  if (rpcError.code !== '42883' && !String(rpcError.message || '').includes('processar_pagamento_pedido_mp')) {
    throw rpcError;
  }

  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .select('id,itens,pagamento_status')
    .eq('id', pedidoId)
    .maybeSingle();

  if (pedidoError) throw pedidoError;
  if (!pedido) throw new Error(`Pedido ${pedidoId} nao encontrado.`);

  if (statusPagamento === 'approved' && pedido.pagamento_status !== 'approved') {
    const totaisPorProduto = new Map<number, number>();
    for (const item of (pedido.itens ?? []) as ItemPedido[]) {
      const produtoId = Number(item.id);
      const quantidade = Number(item.quantidade || 0);
      if (produtoId > 0 && quantidade > 0) {
        totaisPorProduto.set(produtoId, (totaisPorProduto.get(produtoId) || 0) + quantidade);
      }
    }

    for (const [produtoId, quantidade] of Array.from(totaisPorProduto.entries())) {
      const { data: produto, error: produtoError } = await supabase
        .from('produtos')
        .select('id,estoque')
        .eq('id', produtoId)
        .maybeSingle();

      if (produtoError) throw produtoError;
      if (!produto || Number(produto.estoque || 0) < quantidade) {
        throw new Error(`Estoque insuficiente para o produto ${produtoId}.`);
      }

      const { error: estoqueError } = await supabase
        .from('produtos')
        .update({ estoque: Number(produto.estoque || 0) - quantidade })
        .eq('id', produtoId)
        .gte('estoque', quantidade);

      if (estoqueError) throw estoqueError;
    }
  }

  const { error: updateError } = await supabase
    .from('pedidos')
    .update({
      status: statusPedido,
      mercado_pago_payment_id: paymentId,
      pagamento_status: statusPagamento,
      mercado_pago_status_detail: statusDetail || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pedidoId);

  if (updateError) throw updateError;
}

export async function sincronizarPagamentoMercadoPago(paymentId: string) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken || accessToken.includes('seu_access_token')) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN nao configurado.');
  }

  const client = new MercadoPagoConfig({ accessToken });
  const payment = new Payment(client);
  const pagamento = await payment.get({ id: paymentId });
  const pedidoId = pagamento.external_reference || pagamento.metadata?.pedido_id;

  if (!pedidoId) {
    return { ignored: 'missing_external_reference' };
  }

  const supabase = criarSupabaseAdmin();
  const statusPagamento = pagamento.status ?? 'unknown';
  const statusDetail = pagamento.status_detail ?? null;
  const statusPedido = statusPedidoMercadoPago(statusPagamento);

  await processarPagamentoPedidoMercadoPago(
    supabase,
    String(pedidoId),
    String(paymentId),
    statusPagamento,
    statusPedido,
    statusDetail
  );

  if (statusPagamento === 'approved') {
    const { error: creditoError } = await supabase.rpc('finalizar_credito_pedido', {
      p_pedido_id: String(pedidoId),
    });
    if (creditoError) throw creditoError;
    await supabase.rpc('finalizar_cupom_pedido', { p_pedido_id: String(pedidoId) });
  } else if (statusPagamento === 'rejected' || statusPagamento === 'cancelled') {
    const { error: creditoError } = await supabase.rpc('liberar_credito_pedido', {
      p_pedido_id: String(pedidoId),
      p_cliente_id: null,
    });
    if (creditoError) throw creditoError;
  }

  return {
    pedidoId: String(pedidoId),
    paymentId: String(paymentId),
    statusPagamento,
    statusDetail,
    statusPedido,
  };
}
