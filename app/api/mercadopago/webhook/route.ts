import { NextRequest, NextResponse } from 'next/server';
import MercadoPagoConfig, { Payment } from 'mercadopago';
import { criarSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export const runtime = 'nodejs';

function extrairPaymentId(body: any, request: NextRequest) {
  return body?.data?.id ||
    body?.id ||
    request.nextUrl.searchParams.get('data.id') ||
    request.nextUrl.searchParams.get('id');
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

    const { error } = await supabase
      .from('pedidos')
      .update({
        status: statusPedido,
        mercado_pago_payment_id: String(paymentId),
        pagamento_status: statusPagamento,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pedidoId);

    if (error) throw error;

    return NextResponse.json({ received: true, pedidoId, status: statusPedido });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro no webhook Mercado Pago.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
