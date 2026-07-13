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

const URL_PUBLICA_PADRAO = 'https://www.vivalevedf.com.br';

function normalizarSiteUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.hostname === 'vivalevedf.com.br') {
    parsed.hostname = 'www.vivalevedf.com.br';
  }
  return parsed.toString().replace(/\/$/, '');
}

function urlPublicaHttpsValida(url?: string) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const hostnamesInvalidos = ['localhost', '127.0.0.1', '0.0.0.0'];
    return parsed.protocol === 'https:' &&
      !hostnamesInvalidos.includes(hostname) &&
      !hostname.endsWith('.local') &&
      !hostname.startsWith('capacitor');
  } catch {
    return false;
  }
}

function resolverSiteUrlPublica() {
  const candidatos = [
    process.env.MERCADOPAGO_SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '',
    URL_PUBLICA_PADRAO,
  ];

  const url = candidatos.find(urlPublicaHttpsValida) || URL_PUBLICA_PADRAO;
  return normalizarSiteUrl(url);
}

function dividirNome(nome?: string) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return { name: partes[0] || undefined, surname: undefined };
  return {
    name: partes.slice(0, -1).join(' '),
    surname: partes[partes.length - 1],
  };
}

function telefoneMercadoPago(telefone?: string) {
  const digitos = String(telefone ?? '').replace(/\D/g, '');
  if (!digitos) return undefined;
  const semPais = digitos.startsWith('55') ? digitos.slice(2) : digitos;
  return {
    area_code: semPais.slice(0, 2),
    number: semPais.slice(2),
  };
}

export async function POST(request: NextRequest) {
  try {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const siteUrl = resolverSiteUrlPublica();
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
      success: `${baseUrl}/pagamento/sucesso`,
      pending: `${baseUrl}/pagamento/pendente`,
      failure: `${baseUrl}/pagamento/falha`,
    };
    const nomePagador = dividirNome(payer?.nome);

    const body = {
      external_reference: pedidoId,
      notification_url: `${baseUrl}/api/mercadopago/webhook`,
      auto_return: 'approved',
      back_urls: backUrls,
      payer: {
        name: nomePagador.name,
        surname: nomePagador.surname,
        email: payer?.email,
        phone: telefoneMercadoPago(payer?.telefone),
      },
      payment_methods: {
        excluded_payment_types: [],
      },
      items: [{
        id: String(pedido.id),
        title: `Pedido Viva Leve #${String(pedido.id).slice(0, 8).toUpperCase()}`,
        description: itens.map(item => `${item.quantidade}x ${item.nome}`).join(', ').slice(0, 250),
        quantity: 1,
        currency_id: 'BRL',
        unit_price: Number(pedido.valor_total),
      }],
      metadata: {
        pedido_id: pedidoId,
      },
    };

    const resposta = await preference.create({ body });

    if (resposta.id) {
      await supabase
        .from('pedidos')
        .update({
          mercado_pago_preference_id: String(resposta.id),
          updated_at: new Date().toISOString(),
        })
        .eq('id', pedidoId);
    }

    return NextResponse.json({
      preferenceId: resposta.id,
      initPoint: resposta.init_point,
      sandboxInitPoint: resposta.sandbox_init_point,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao criar preferência Mercado Pago.' }, { status: 500 });
  }
}
