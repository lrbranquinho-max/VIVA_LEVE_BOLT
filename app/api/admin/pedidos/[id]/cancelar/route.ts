import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { criarSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

type GatewayResult = {
  payment_cancelled?: boolean;
  preference_expired?: boolean;
};

async function mercadoPagoRequest(path: string, body: Record<string, unknown>, accessToken: string) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message || `Mercado Pago recusou o cancelamento (${response.status}).`);
  }
}

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const authorization = request.headers.get('authorization');
    const pedidoId = Number(context.params.id);

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase não configurado no servidor.' }, { status: 500 });
    }
    if (!authorization) {
      return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 });
    }
    if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) {
      return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
    }

    const { motivo } = await request.json() as { motivo?: string };
    const motivoNormalizado = String(motivo || '').trim();
    if (motivoNormalizado.length < 3 || motivoNormalizado.length > 500) {
      return NextResponse.json({ error: 'Informe um motivo entre 3 e 500 caracteres.' }, { status: 400 });
    }

    const supabaseUsuario = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [{ data: auth, error: authError }, { data: isAdmin, error: adminError }] = await Promise.all([
      supabaseUsuario.auth.getUser(),
      supabaseUsuario.rpc('is_viva_leve_admin'),
    ]);
    if (authError || !auth.user) {
      return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 });
    }
    if (adminError || !isAdmin) {
      return NextResponse.json({ error: 'Acesso restrito ao administrador.' }, { status: 403 });
    }

    const supabaseAdmin = criarSupabaseAdmin();
    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from('pedidos')
      .select('id,status,pagamento_status,pago_em,mercado_pago_payment_id,mercado_pago_preference_id,cancelado_admin_em')
      .eq('id', pedidoId)
      .maybeSingle();
    if (pedidoError) throw pedidoError;
    if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });

    const gatewayResult: GatewayResult = {};
    const pagamentoStatus = String(pedido.pagamento_status || '').trim().toLowerCase();
    const precisaCancelarPagamento = ['pending', 'in_process', 'authorized'].includes(pagamentoStatus)
      && Boolean(pedido.mercado_pago_payment_id);
    const precisaExpirarPreferencia = Boolean(pedido.mercado_pago_preference_id);

    if (precisaCancelarPagamento || precisaExpirarPreferencia) {
      const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
      if (!accessToken || accessToken.includes('seu_access_token')) {
        return NextResponse.json({ error: 'Não foi possível invalidar a cobrança no Mercado Pago.' }, { status: 503 });
      }

      if (precisaCancelarPagamento) {
        await mercadoPagoRequest(
          `/v1/payments/${encodeURIComponent(String(pedido.mercado_pago_payment_id))}`,
          { status: 'cancelled' },
          accessToken,
        );
        gatewayResult.payment_cancelled = true;
      }
      if (precisaExpirarPreferencia) {
        await mercadoPagoRequest(
          `/checkout/preferences/${encodeURIComponent(String(pedido.mercado_pago_preference_id))}`,
          { expires: true, expiration_date_to: new Date(Date.now() + 60_000).toISOString() },
          accessToken,
        );
        gatewayResult.preference_expired = true;
      }
    }

    const { data, error } = await supabaseUsuario.rpc('cancelar_pedido_nao_pago_admin', {
      p_pedido_id: pedidoId,
      p_motivo: motivoNormalizado,
      p_gateway_result: gatewayResult,
    });
    if (error) {
      const status = error.code === '23514' || error.code === '22023' ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Não foi possível cancelar o pedido.' }, { status: 500 });
  }
}
