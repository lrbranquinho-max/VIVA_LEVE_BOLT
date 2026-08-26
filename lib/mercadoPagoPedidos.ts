import MercadoPagoConfig, { Payment } from 'mercadopago';
import { criarSupabaseAdmin } from './supabaseAdmin';
import { meioPagamentoMercadoPago } from './meiosPagamento';

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
  // Financial and stock updates must remain atomic in PostgreSQL.
  throw rpcError;
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
  const meioPagamento = meioPagamentoMercadoPago(
    pagamento.payment_method_id,
    pagamento.payment_type_id,
  );

  await processarPagamentoPedidoMercadoPago(
    supabase,
    String(pedidoId),
    String(paymentId),
    statusPagamento,
    statusPedido,
    statusDetail
  );

  if (meioPagamento) {
    const { error: meioPagamentoError } = await supabase
      .from('pedidos')
      .update({ meio_pagamento: meioPagamento, updated_at: new Date().toISOString() })
      .eq('id', String(pedidoId));
    if (meioPagamentoError) throw meioPagamentoError;
  }

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
