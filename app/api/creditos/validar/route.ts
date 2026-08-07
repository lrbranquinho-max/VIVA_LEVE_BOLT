import { NextRequest, NextResponse } from 'next/server';
import { autenticarUsuarioApi } from '../../../../lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await autenticarUsuarioApi(request);
    const { chave } = await request.json() as { chave?: string };
    const chaveNormalizada = String(chave ?? '').trim().toUpperCase();
    if (!chaveNormalizada) {
      return NextResponse.json({ error: 'Informe a chave de crédito.' }, { status: 400 });
    }

    let { data: credito, error } = await supabase
      .from('creditos_pagamento')
      .select('id, valor_disponivel, valor_reservado, email_restricao, ativo')
      .ilike('chave', chaveNormalizada)
      .maybeSingle();

    if (error) throw error;
    if (!credito) return NextResponse.json({ error: 'Chave de crédito não encontrada.' }, { status: 404 });

    const { data: reservasExpiradas, error: reservasError } = await supabase
      .from('creditos_pagamento_movimentos')
      .select('pedido_id')
      .eq('credito_id', credito.id)
      .eq('status', 'reservado')
      .lte('expira_em', new Date().toISOString());
    if (reservasError) throw reservasError;

    for (const reserva of reservasExpiradas ?? []) {
      const { error: liberarError } = await supabase.rpc('liberar_credito_pedido', {
        p_pedido_id: String(reserva.pedido_id),
        p_cliente_id: null,
      });
      if (liberarError) throw liberarError;
    }

    if ((reservasExpiradas ?? []).length > 0) {
      const recarga = await supabase
        .from('creditos_pagamento')
        .select('id, valor_disponivel, valor_reservado, email_restricao, ativo')
        .eq('id', credito.id)
        .maybeSingle();
      if (recarga.error) throw recarga.error;
      if (recarga.data) credito = recarga.data;
    }
    if (!credito.ativo) return NextResponse.json({ error: 'Esta chave de crédito está inativa.' }, { status: 400 });

    const emailRestricao = String(credito.email_restricao ?? '').trim().toLowerCase();
    if (emailRestricao && emailRestricao !== String(user.email ?? '').trim().toLowerCase()) {
      return NextResponse.json({ error: 'Esta chave de crédito pertence a outro usuário.' }, { status: 403 });
    }

    const valorDisponivel = Math.max(
      Number(credito.valor_disponivel || 0) - Number(credito.valor_reservado || 0),
      0,
    );
    if (valorDisponivel <= 0) {
      return NextResponse.json({ error: 'Esta chave de crédito não possui saldo disponível.' }, { status: 400 });
    }

    return NextResponse.json({ chave: chaveNormalizada, valorDisponivel });
  } catch (error: any) {
    const status = String(error?.message || '').includes('autenticad') || String(error?.message || '').includes('Sessão') ? 401 : 500;
    return NextResponse.json({ error: error?.message || 'Não foi possível validar a chave de crédito.' }, { status });
  }
}
