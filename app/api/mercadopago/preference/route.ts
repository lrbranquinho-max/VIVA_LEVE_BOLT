import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import MercadoPagoConfig, { Preference } from 'mercadopago';

interface ItemCheckout {
  id: number;
  nome: string;
  descricao?: string;
  imagem_url?: string;
  preco: number;
  quantidade: number;
  subtotal?: number;
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

function somenteDigitos(valor?: string) {
  return String(valor ?? '').replace(/\D/g, '');
}

function telefoneMercadoPago(telefone?: string) {
  const digitos = somenteDigitos(telefone);
  if (!digitos) return undefined;
  const semPais = digitos.startsWith('55') ? digitos.slice(2) : digitos;
  return {
    area_code: semPais.slice(0, 2),
    number: semPais.slice(2),
  };
}

function montarItensMercadoPago(itens: ItemCheckout[], pedido: any) {
  const subtotalItens = itens.reduce((total, item) => {
    const subtotal = Number(item.subtotal ?? Number(item.preco || 0) * Number(item.quantidade || 0));
    return total + subtotal;
  }, 0);
  const valorFrete = Number(pedido.valor_frete || 0);
  const totalPedido = Number(pedido.valor_total || 0);
  const totalProdutosCobrado = Math.max(totalPedido - valorFrete, 0);

  if (subtotalItens <= 0 || totalPedido <= 0) {
    return [{
      id: String(pedido.id),
      title: `Pedido Viva Leve #${String(pedido.id).slice(0, 8).toUpperCase()}`,
      description: itens.map(item => `${item.quantidade}x ${item.nome}`).join(', ').slice(0, 250),
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Number(totalPedido.toFixed(2)),
      category_id: 'food',
    }];
  }

  const alvoProdutosCentavos = Math.round(totalProdutosCobrado * 100);
  let centavosDistribuidos = 0;
  const itensPreferencia = itens.map((item, index) => {
    const subtotal = Number(item.subtotal ?? Number(item.preco || 0) * Number(item.quantidade || 0));
    const centavosLinha = index === itens.length - 1
      ? Math.max(alvoProdutosCentavos - centavosDistribuidos, 0)
      : Math.max(Math.round((subtotal / subtotalItens) * alvoProdutosCentavos), 0);
    centavosDistribuidos += centavosLinha;

    return {
      id: `produto_${item.id}`,
      title: `${item.quantidade}x ${item.nome}`.slice(0, 120),
      description: String(item.descricao || item.nome || 'Produto Viva Leve').slice(0, 250),
      picture_url: item.imagem_url || undefined,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Number((centavosLinha / 100).toFixed(2)),
      category_id: 'food',
    };
  }).filter(item => item.unit_price > 0);

  if (valorFrete > 0) {
    itensPreferencia.push({
      id: `frete_${pedido.id}`,
      title: 'Taxa de entrega Viva Leve',
      description: String(pedido.endereco_entrega || 'Entrega Viva Leve').slice(0, 250),
      picture_url: undefined,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Number(valorFrete.toFixed(2)),
      category_id: 'shipping',
    });
  }

  return itensPreferencia;
}

function additionalInfoPedido(itens: ItemCheckout[], pedido: any, payer: any) {
  const resumoItens = itens
    .map(item => `${item.quantidade}x ${item.nome} (${Number(item.preco || 0).toFixed(2)})`)
    .join('; ');

  return [
    `Pedido Viva Leve #${pedido.id}`,
    `Itens: ${resumoItens}`,
    `Subtotal: ${Number(pedido.subtotal_produtos || 0).toFixed(2)}`,
    `Desconto: ${Number(pedido.desconto_valor || 0).toFixed(2)}`,
    `Frete: ${Number(pedido.valor_frete || 0).toFixed(2)}`,
    `Entrega: ${payer?.endereco || pedido.endereco_entrega || ''}`,
  ].join(' | ').slice(0, 600);
}

function enderecoMercadoPago(endereco?: string) {
  const partes = String(endereco ?? '').split(',').map(parte => parte.trim()).filter(Boolean);
  if (partes.length === 0) return undefined;

  return {
    street_name: partes[0],
    street_number: partes[1],
    city_name: partes[3],
    state_name: 'DF/GO',
    country_name: 'Brasil',
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
      payer?: { nome?: string; email?: string; telefone?: string; cpf?: string; endereco?: string; regiao?: string };
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
      .select('id, valor_total, status, subtotal_produtos, valor_frete, desconto_valor, endereco_entrega')
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
    const cpfPagador = somenteDigitos(payer?.cpf);
    const telefonePagador = telefoneMercadoPago(payer?.telefone);
    const enderecoPagador = enderecoMercadoPago(payer?.endereco || pedido.endereco_entrega);
    const itensPreferencia = montarItensMercadoPago(itens, pedido);

    const body = {
      external_reference: pedidoId,
      notification_url: `${baseUrl}/api/mercadopago/webhook`,
      auto_return: 'all',
      back_urls: backUrls,
      additional_info: additionalInfoPedido(itens, pedido, payer),
      payer: {
        name: nomePagador.name,
        surname: nomePagador.surname,
        email: payer?.email,
        phone: telefonePagador,
        identification: cpfPagador.length === 11 ? {
          type: 'CPF',
          number: cpfPagador,
        } : undefined,
        address: enderecoPagador ? {
          street_name: enderecoPagador.street_name,
          street_number: enderecoPagador.street_number,
        } : undefined,
      },
      payment_methods: {
        excluded_payment_types: [],
      },
      items: itensPreferencia,
      shipments: enderecoPagador ? {
        mode: 'not_specified',
        cost: Number(pedido.valor_frete || 0),
        free_shipping: Number(pedido.valor_frete || 0) === 0,
        receiver_address: enderecoPagador,
      } : undefined,
      statement_descriptor: 'VIVA LEVE',
      metadata: {
        pedido_id: pedidoId,
        cliente_regiao: payer?.regiao,
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
