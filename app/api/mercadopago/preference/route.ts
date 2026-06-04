import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import MercadoPagoConfig, { Preference } from 'mercadopago';

interface ItemCheckout {
  id: number;
  nome: string;
  preco: number;
  quantidade: number;
}

export const runtime = 'nodejs';

function normalizarSiteUrl(url: string) {
  return url.replace(/\/$/, '');
}

function permiteAutoReturn(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      !['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const authorization = request.headers.get('authorization');

    if (!accessToken || accessToken.includes('seu_access_token')) {
      return NextResponse.json({ error: 'MERCADOPAGO_ACCESS_TOKEN não configurado.' }, { status: 500 });
    }
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase não configurado no servidor.' }, { status: 500 });
    }
    if (!authorization) {
      return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 });
    }

    const { pedidoId, itens, payer } = await request.json() as {
      pedidoId?: string;
      itens?: ItemCheckout[];
      payer?: { nome?: string; email?: string; telefone?: string };
    };

    if (!pedidoId || !Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json({ error: 'Pedido ou itens inválidos.' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('id, valor_total, status')
      .eq('id', pedidoId)
      .maybeSingle();

    if (pedidoError) throw pedidoError;
    if (!pedido) {
      return NextResponse.json({ error: 'Pedido não encontrado para este usuário.' }, { status: 404 });
    }

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);
    const baseUrl = normalizarSiteUrl(siteUrl);
    const backUrls = {
      success: `${baseUrl}/pedidos?pagamento=sucesso`,
      pending: `${baseUrl}/pedidos?pagamento=pendente`,
      failure: `${baseUrl}/pedidos?pagamento=falha`,
    };

    const body = {
      external_reference: pedidoId,
      notification_url: `${baseUrl}/api/mercadopago/webhook`,
      ...(permiteAutoReturn(baseUrl) ? { auto_return: 'approved' } : {}),
      back_urls: backUrls,
      payer: {
        name: payer?.nome,
        email: payer?.email,
        phone: payer?.telefone ? { number: payer.telefone.replace(/\D/g, '') } : undefined,
      },
      items: itens.map(item => ({
        id: String(item.id),
        title: item.nome,
        quantity: Number(item.quantidade),
        currency_id: 'BRL',
        unit_price: Number(item.preco),
      })),
      metadata: {
        pedido_id: pedidoId,
      },
    };

    const resposta = await preference.create({ body });

    return NextResponse.json({
      preferenceId: resposta.id,
      initPoint: resposta.init_point,
      sandboxInitPoint: resposta.sandbox_init_point,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao criar preferência Mercado Pago.' }, { status: 500 });
  }
}
