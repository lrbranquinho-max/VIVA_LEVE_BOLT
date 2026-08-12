import { NextRequest, NextResponse } from 'next/server';
import { criarSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VoucherRequest {
  pedidoId?: string | number;
  tipo?: 'credito' | 'debito' | 'alelo';
  paymentToken?: string;
  brand?: string;
  browserFingerprint?: string;
  externalAuthentication?: {
    Cavv?: string;
    Xid?: string;
    Eci?: string;
    Version?: string;
    ReferenceId?: string;
  };
  payer?: {
    nome?: string;
    cpf?: string;
  };
}

interface CieloPayment {
  PaymentId?: string;
  Tid?: string;
  Status?: number;
  ReturnCode?: string;
  ReturnMessage?: string;
}

interface CieloResponse {
  Payment?: CieloPayment;
  Code?: number | string;
  Message?: string;
}

const CIELO_URLS = {
  sandbox: 'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/',
  production: 'https://api.cieloecommerce.cielo.com.br/1/sales/',
};

const mensagensCielo: Record<string, string> = {
  '05': 'Pagamento não autorizado. Confira os dados ou use outro cartão.',
  '14': 'Número do cartão inválido. Confira e tente novamente.',
  '41': 'Cartão bloqueado. Entre em contato com a administradora do benefício.',
  '43': 'Cartão bloqueado. Entre em contato com a administradora do benefício.',
  '51': 'Saldo insuficiente no cartão de benefício.',
  '54': 'Cartão vencido. Confira a validade ou use outro cartão.',
  '57': 'Transação não permitida para este cartão de benefício.',
  '61': 'Limite da transação excedido. Consulte a administradora do benefício.',
  '78': 'Cartão ainda não desbloqueado. Faça o desbloqueio antes de tentar novamente.',
};

function normalizarTextoCielo(valor?: string, limite = 255) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limite);
}

function somenteDigitos(valor?: string) {
  return String(valor ?? '').replace(/\D/g, '');
}

function mensagemAmigavel(codigo?: string, retorno?: string) {
  return mensagensCielo[String(codigo ?? '')] ||
    (retorno ? `Pagamento não aprovado: ${retorno}` : 'Não foi possível autorizar o cartão de benefício. Tente novamente.');
}

function respostaJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
    },
  });
}

export async function POST(request: NextRequest) {
  let pedidoId = '';
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (!token) return respostaJson({ error: 'Sessão inválida. Entre novamente para pagar.' }, 401);

    const supabase = criarSupabaseAdmin();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return respostaJson({ error: 'Sessão inválida. Entre novamente para pagar.' }, 401);

    const merchantId = process.env.CIELO_MERCHANT_ID?.trim();
    const merchantKey = process.env.CIELO_MERCHANT_KEY?.trim();
    if (!merchantId || !merchantKey) {
      return respostaJson({ error: 'Pagamento por benefício temporariamente indisponível. Credenciais Cielo não configuradas.' }, 503);
    }

    const body = await request.json() as VoucherRequest;
    pedidoId = String(body.pedidoId ?? '').trim();
    if (!pedidoId) return respostaJson({ error: 'Pedido não informado.' }, 400);

    const tipo = body.tipo;
    if (!tipo || !['credito', 'debito', 'alelo'].includes(tipo)) {
      return respostaJson({ error: 'Selecione crédito, débito ou Alelo.' }, 400);
    }
    const meioPagamento = `cielo_${tipo}`;

    const paymentToken = String(body.paymentToken ?? '').trim();
    if (!/^[a-f0-9-]{36}$/i.test(paymentToken)) {
      return respostaJson({ error: 'Token seguro do cartão inválido ou expirado.' }, 400);
    }
    const cpf = somenteDigitos(body.payer?.cpf);
    if (cpf.length !== 11) return respostaJson({ error: 'CPF do pagador inválido.' }, 400);

    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('id,cliente_id,valor_total,itens,status,pagamento_status')
      .eq('id', pedidoId)
      .maybeSingle();

    if (pedidoError || !pedido) return respostaJson({ error: 'Pedido não encontrado.' }, 404);
    if (String(pedido.cliente_id) !== authData.user.id) return respostaJson({ error: 'Você não pode pagar este pedido.' }, 403);
    if (pedido.pagamento_status === 'approved') return respostaJson({ error: 'Este pedido já foi pago.' }, 409);

    const { error: meioPagamentoError } = await supabase
      .from('pedidos')
      .update({ meio_pagamento: meioPagamento, updated_at: new Date().toISOString() })
      .eq('id', pedido.id);
    if (meioPagamentoError) throw new Error(meioPagamentoError.message);

    const valorCentavos = Math.round(Number(pedido.valor_total || 0) * 100);
    if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) return respostaJson({ error: 'Valor do pedido inválido.' }, 400);

    const ambiente = process.env.CIELO_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
    const merchantOrderId = `VL${pedidoId}${Date.now().toString().slice(-8)}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    const brand = tipo === 'alelo' ? 'Elo' : normalizarTextoCielo(body.brand || '', 10);
    if (!brand) return respostaJson({ error: 'Não foi possível identificar a bandeira do cartão.' }, 400);

    const cart = Array.isArray(pedido.itens) ? pedido.itens.map((item: any) => ({
      Name: String(item?.nome || 'Produto Viva Leve').slice(0, 255),
      Quantity: Math.max(1, Number(item?.quantidade || 1)),
      Sku: String(item?.id || '').slice(0, 32),
      UnitPrice: Math.max(1, Math.round(Number(item?.preco || 0) * 100)),
    })) : [];

    let paymentRequest: Record<string, unknown>;
    if (tipo === 'credito') {
      const antifraudProvider = process.env.CIELO_ANTIFRAUD_PROVIDER?.trim();
      if (!antifraudProvider) {
        return respostaJson({ error: 'Pagamento Cielo por crédito aguardando configuração do provedor antifraude.' }, 503);
      }
      paymentRequest = {
        Type: 'CreditCard',
        Amount: valorCentavos,
        Installments: 1,
        Capture: true,
        CreditCard: { PaymentToken: paymentToken, Brand: brand },
        FraudAnalysis: {
          Provider: antifraudProvider,
          Sequence: 'AnalyseFirst',
          SequenceCriteria: 'OnSuccess',
          ...(body.browserFingerprint ? { Browser: { BrowserFingerprint: body.browserFingerprint } } : {}),
        },
        Cart: { Items: cart },
      };
    } else if (tipo === 'debito') {
      const auth = body.externalAuthentication;
      if (!auth?.Eci || !auth?.Version || !auth?.Cavv) {
        return respostaJson({ error: 'A autenticação 3DS do cartão de débito não foi concluída.' }, 422);
      }
      paymentRequest = {
        Type: 'DebitCard',
        Amount: valorCentavos,
        Installments: 1,
        Capture: true,
        Authenticate: true,
        ReturnUrl: 'https://www.vivalevedf.com.br/pagamento/pendente',
        ExternalAuthentication: {
          Cavv: auth.Cavv,
          Xid: auth.Xid,
          Eci: auth.Eci,
          Version: auth.Version,
          ReferenceId: auth.ReferenceId,
        },
        DebitCard: { PaymentToken: paymentToken, Brand: brand },
      };
    } else {
      paymentRequest = {
        Type: 'DebitCard',
        Amount: valorCentavos,
        Installments: 1,
        Capture: true,
        Authenticate: false,
        DebitCard: { PaymentToken: paymentToken, Brand: 'Elo' },
      };
    }

    const payload = {
      MerchantOrderId: merchantOrderId,
      Customer: {
        Name: normalizarTextoCielo(body.payer?.nome || authData.user.user_metadata?.nome || authData.user.user_metadata?.full_name || 'Cliente Viva Leve'),
        Identity: cpf,
        IdentityType: 'CPF',
        Email: authData.user.email,
      },
      Payment: paymentRequest,
    };

    const cieloHttp = await fetch(CIELO_URLS[ambiente], {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        MerchantId: merchantId,
        MerchantKey: merchantKey,
        RequestId: crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const cielo = await cieloHttp.json().catch(() => ({})) as CieloResponse | CieloResponse[];
    const erroApi = Array.isArray(cielo) ? cielo[0] : cielo;
    if (!cieloHttp.ok || Array.isArray(cielo)) {
      const codigo = String(erroApi?.Code ?? cieloHttp.status);
      const mensagem = mensagemAmigavel(codigo, erroApi?.Message);
      await supabase.rpc('processar_pagamento_pedido_cielo', {
        p_pedido_id: pedidoId,
        p_payment_id: null,
        p_tid: null,
        p_cielo_status: null,
        p_return_code: codigo,
        p_return_message: erroApi?.Message ?? mensagem,
        p_pagamento_status: 'error',
        p_status_pedido: 'Aguardando Pagamento',
      });
      await supabase.from('pedidos').update({ meio_pagamento: meioPagamento }).eq('id', pedidoId);
      await supabase.rpc('liberar_credito_pedido', {
        p_pedido_id: pedidoId,
        p_cliente_id: authData.user.id,
      });
      return respostaJson({ error: mensagem, code: codigo }, cieloHttp.status >= 500 ? 502 : 400);
    }

    const payment = cielo.Payment;
    const aprovado = payment?.Status === 2 && ['00', '0', '6'].includes(String(payment.ReturnCode ?? ''));
    const pendente = payment?.Status === 1 || payment?.Status === 12;
    const pagamentoStatus = aprovado ? 'approved' : pendente ? 'pending' : 'denied';
    const statusPedido = aprovado ? 'Em Preparo' : 'Aguardando Pagamento';

    const { error: processarError } = await supabase.rpc('processar_pagamento_pedido_cielo', {
      p_pedido_id: pedidoId,
      p_payment_id: payment?.PaymentId ?? null,
      p_tid: payment?.Tid ?? null,
      p_cielo_status: payment?.Status ?? null,
      p_return_code: payment?.ReturnCode ?? null,
      p_return_message: payment?.ReturnMessage ?? null,
      p_pagamento_status: pagamentoStatus,
      p_status_pedido: statusPedido,
    });
    if (processarError) throw new Error(processarError.message);

    const { error: registrarMeioError } = await supabase
      .from('pedidos')
      .update({ meio_pagamento: meioPagamento, updated_at: new Date().toISOString() })
      .eq('id', pedidoId);
    if (registrarMeioError) throw new Error(registrarMeioError.message);

    if (!aprovado) {
      if (!pendente) {
        const { error: liberarError } = await supabase.rpc('liberar_credito_pedido', {
          p_pedido_id: pedidoId,
          p_cliente_id: authData.user.id,
        });
        if (liberarError) throw new Error(liberarError.message);
      }
      return respostaJson({
        error: pendente
          ? 'Pagamento em análise. Acompanhe a atualização na página de pedidos.'
          : mensagemAmigavel(payment?.ReturnCode, payment?.ReturnMessage),
        code: payment?.ReturnCode,
        status: pagamentoStatus,
      }, pendente ? 202 : 402);
    }

    const { error: creditoError } = await supabase.rpc('finalizar_credito_pedido', {
      p_pedido_id: pedidoId,
    });
    if (creditoError) throw new Error(creditoError.message);

    const { error: cupomError } = await supabase.rpc('finalizar_cupom_pedido', {
      p_pedido_id: pedidoId,
    });
    if (cupomError) throw new Error(cupomError.message);

    return respostaJson({ approved: true, paymentId: payment?.PaymentId, status: pagamentoStatus });
  } catch (error: any) {
    console.error('[Cielo Voucher] Falha sem dados sensíveis', { pedidoId, message: error?.message });
    return respostaJson({ error: 'Não foi possível concluir o pagamento por benefício. Tente novamente.' }, 500);
  }
}
