import MercadoPagoConfig, { Payment } from 'mercadopago';
import { criarSupabaseAdmin } from './supabaseAdmin';
import { meioPagamentoMercadoPago } from './meiosPagamento';
import { purchaseQualifies } from './premium/domain';

interface ItemPedido {
  id?: number;
  quantidade?: number;
}

async function concederBeneficioCompraConfirmada(
  supabase: ReturnType<typeof criarSupabaseAdmin>, pedidoId: string, paymentId: string, amountCents: number,
) {
  const [{ data: settings, error: settingsError }, { data: pedido, error: pedidoError }] = await Promise.all([
    supabase.from('premium_settings').select('purchase_reward_enabled,purchase_minimum_cents,purchase_plan_id,purchase_duration_days').single(),
    supabase.from('pedidos').select('id,cliente_id,pagamento_status').eq('id', pedidoId).maybeSingle(),
  ]);
  // A deployment may receive an old webhook before the premium migration is installed.
  if (settingsError?.code === '42P01' || settingsError?.code === 'PGRST205') return;
  if (settingsError) throw settingsError;
  if (pedidoError) throw pedidoError;
  if (!settings?.purchase_reward_enabled || !pedido?.cliente_id || pedido.pagamento_status !== 'approved') return;
  if (!purchaseQualifies(amountCents, settings.purchase_minimum_cents)) return;
  const { error } = await supabase.rpc('premium_grant_access', {
    p_user_id: pedido.cliente_id, p_plan_id: settings.purchase_plan_id, p_duration_days: settings.purchase_duration_days,
    p_source_type: 'PURCHASE_REWARD', p_source_id: pedidoId, p_idempotency_key: `purchase:${pedidoId}`,
    p_actor_id: null, p_reason: `Pagamento ${paymentId} confirmado pelo gateway`, p_partner_id: null,
  });
  if (error) throw error;
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

  if (String(pedidoId).startsWith('premium:')) {
    const checkoutId=String(pedidoId).slice('premium:'.length);
    if(!/^[0-9a-f-]{36}$/i.test(checkoutId)) return { ignored:'invalid_premium_reference' };
    const supabase=criarSupabaseAdmin();
    const amountCents=Math.round(Number(pagamento.transaction_amount||0)*100);
    const {error}=await supabase.rpc('premium_record_payment',{p_checkout_id:checkoutId,p_payment_id:String(paymentId),
      p_status:pagamento.status??'unknown',p_amount_cents:amountCents,p_detail:pagamento.status_detail??null});
    if(error) throw error;
    return {pedidoId:String(pedidoId),paymentId:String(paymentId),statusPagamento:pagamento.status??'unknown',
      statusDetail:pagamento.status_detail??null,statusPedido:'Plano digital'};
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
    await concederBeneficioCompraConfirmada(
      supabase, String(pedidoId), String(paymentId), Math.round(Number(pagamento.transaction_amount || 0) * 100),
    );
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
