import { NextRequest, NextResponse } from 'next/server';
import MercadoPagoConfig, { Payment } from 'mercadopago';
import { criarSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export const runtime = 'nodejs';

interface ItemPedido {
  id?: number;
  quantidade?: number;
}

function extrairPaymentId(body: any, request: NextRequest) {
  return body?.data?.id ||
    body?.id ||
    request.nextUrl.searchParams.get('data.id') ||
    request.nextUrl.searchParams.get('id');
}

async function processarPagamentoComFallback(
  supabase: ReturnType<typeof criarSupabaseAdmin>,
  pedidoId: string,
  paymentId: string,
  statusPagamento: string,
  statusPedido: string,
) {
  const { error: rpcError } = await supabase.rpc('processar_pagamento_pedido_mp', {
    p_pedido_id: pedidoId,
    p_payment_id: paymentId,
    p_pagamento_status: statusPagamento,
    p_status_pedido: statusPedido,
  });

  if (!rpcError) return;
  if (rpcError.code !== '42883' && !String(rpcError.message || '').includes('processar_pagamento_pedido_mp')) {
    throw rpcError;
  }

  const { data: pedido, error: pedidoError } = await supabase
    .from('pedidos')
    .select('id,itens,pagamento_status')
    .eq('id', pedidoId)
    .maybeSingle();

  if (pedidoError) throw pedidoError;
  if (!pedido) throw new Error(`Pedido ${pedidoId} não encontrado.`);

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
      updated_at: new Date().toISOString(),
    })
    .eq('id', pedidoId);

  if (updateError) throw updateError;
}

export async function POST(request: NextRequest) {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken || accessToken.includes('seu_access_token')) {
      return NextResponse.json({ error: 'MERCADOPAGO_ACCESS_TOKEN não configurado.' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const topic = body?.type || body?.topic || request.nextUrl.searchParams.get('type') || request.nextUrl.searchParams.get('topic');
    const paymentId = extrairPaymentId(body, request);

    if (topic && topic !== 'payment') {
      return NextResponse.json({ received: true, ignored: topic });
    }
    if (!paymentId) {
      return NextResponse.json({ received: true, ignored: 'missing_payment_id' });
    }

    const client = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(client);
    const pagamento = await payment.get({ id: paymentId });
    const pedidoId = pagamento.external_reference || pagamento.metadata?.pedido_id;

    if (!pedidoId) {
      return NextResponse.json({ received: true, ignored: 'missing_external_reference' });
    }

    const supabase = criarSupabaseAdmin();
    const statusPagamento = pagamento.status ?? 'unknown';
    const statusPedido = statusPagamento === 'approved' ? 'Em Preparo' :
      statusPagamento === 'pending' || statusPagamento === 'in_process' ? 'Aguardando Pagamento' :
      statusPagamento === 'rejected' || statusPagamento === 'cancelled' ? 'Pagamento Recusado' :
      'Aguardando Pagamento';

    await processarPagamentoComFallback(supabase, String(pedidoId), String(paymentId), statusPagamento, statusPedido);

    return NextResponse.json({ received: true, pedidoId, status: statusPedido });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro no webhook Mercado Pago.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
