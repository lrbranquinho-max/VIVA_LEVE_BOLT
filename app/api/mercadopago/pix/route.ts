import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import MercadoPagoConfig, { Payment } from 'mercadopago';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const authorization = request.headers.get('authorization');

    if (!accessToken || accessToken.includes('seu_access_token')) {
      return NextResponse.json({ error: 'MERCADOPAGO_ACCESS_TOKEN nao configurado.' }, { status: 500 });
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase nao configurado no servidor.' }, { status: 500 });
    }
    if (!authorization) {
      return NextResponse.json({ error: 'Usuario nao autenticado.' }, { status: 401 });
    }

    const { pedidoId, payer } = await request.json() as {
      pedidoId?: string;
      payer?: { nome?: string; email?: string; telefone?: string };
    };

    if (!pedidoId || !payer?.email) {
      return NextResponse.json({ error: 'Pedido ou pagador invalidos.' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('id, valor_total')
      .eq('id', pedidoId)
      .maybeSingle();

    if (pedidoError) throw pedidoError;
    if (!pedido) {
      return NextResponse.json({ error: 'Pedido nao encontrado para este usuario.' }, { status: 404 });
    }

    const client = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(client);
    const resposta: any = await payment.create({
      body: {
        transaction_amount: Number(pedido.valor_total),
        description: `Pedido Viva Leve #${String(pedido.id).slice(0, 8).toUpperCase()}`,
        payment_method_id: 'pix',
        external_reference: String(pedido.id),
        payer: {
          email: payer.email,
          first_name: payer.nome,
          phone: payer.telefone ? { number: payer.telefone.replace(/\D/g, '') } : undefined,
        },
        metadata: {
          pedido_id: pedido.id,
        },
      },
    });

    const transactionData = resposta?.point_of_interaction?.transaction_data;
    if (!transactionData?.qr_code) {
      return NextResponse.json({ error: 'Mercado Pago nao retornou o codigo Pix.' }, { status: 500 });
    }

    await supabase
      .from('pedidos')
      .update({
        mercado_pago_payment_id: String(resposta.id),
        pagamento_status: resposta.status ?? 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', pedido.id);

    return NextResponse.json({
      paymentId: resposta.id,
      status: resposta.status,
      qrCode: transactionData.qr_code,
      qrCodeBase64: transactionData.qr_code_base64,
      ticketUrl: transactionData.ticket_url,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao criar pagamento Pix.' }, { status: 500 });
  }
}
