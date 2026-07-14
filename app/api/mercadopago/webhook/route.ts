import { NextRequest, NextResponse } from 'next/server';
import {
  WebhookSignatureValidator,
} from 'mercadopago';
import { sincronizarPagamentoMercadoPago } from '../../../../lib/mercadoPagoPedidos';

export const runtime = 'nodejs';

function extrairPaymentId(body: any, request: NextRequest) {
  return body?.data?.id ||
    body?.id ||
    request.nextUrl.searchParams.get('data.id') ||
    request.nextUrl.searchParams.get('data_id') ||
    request.nextUrl.searchParams.get('id');
}

function ehWebhookAssinado(body: any, request: NextRequest) {
  return Boolean(
    body?.type ||
    body?.data?.id ||
    request.nextUrl.searchParams.get('type') ||
    request.nextUrl.searchParams.get('data.id') ||
    request.nextUrl.searchParams.get('data_id')
  );
}

function validarAssinaturaWebhook(body: any, request: NextRequest) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const xSignature = request.headers.get('x-signature');

  if (!secret || secret.includes('sua_assinatura')) {
    return;
  }

  if (!xSignature) {
    if (ehWebhookAssinado(body, request)) {
      console.warn('Webhook Mercado Pago sem x-signature; seguindo com validacao via API.', {
        paymentId: extrairPaymentId(body, request),
        requestId: request.headers.get('x-request-id'),
      });
    }
    return;
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature,
      xRequestId: request.headers.get('x-request-id'),
      dataId: extrairPaymentId(body, request),
      secret,
      toleranceSeconds: 600,
    });
  } catch (error: any) {
    console.warn('Assinatura invalida no webhook Mercado Pago; seguindo com validacao via API.', {
      reason: error?.reason,
      requestId: error?.requestId || request.headers.get('x-request-id'),
      timestamp: error?.timestamp,
      paymentId: extrairPaymentId(body, request),
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    validarAssinaturaWebhook(body, request);

    const topic = body?.type || body?.topic || request.nextUrl.searchParams.get('type') || request.nextUrl.searchParams.get('topic');
    const paymentId = extrairPaymentId(body, request);

    if (topic && topic !== 'payment') {
      return NextResponse.json({ received: true, ignored: topic });
    }
    if (!paymentId) {
      return NextResponse.json({ received: true, ignored: 'missing_payment_id' });
    }

    const resultado = await sincronizarPagamentoMercadoPago(String(paymentId));
    if ('ignored' in resultado) {
      return NextResponse.json({ received: true, ignored: resultado.ignored });
    }

    return NextResponse.json({
      received: true,
      pedidoId: resultado.pedidoId,
      status: resultado.statusPedido,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro no webhook Mercado Pago.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
