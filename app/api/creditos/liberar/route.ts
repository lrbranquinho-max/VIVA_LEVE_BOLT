import { NextRequest, NextResponse } from 'next/server';
import { autenticarUsuarioApi } from '../../../../lib/apiAuth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await autenticarUsuarioApi(request);
    const { pedidoId } = await request.json() as { pedidoId?: string | number };
    if (!pedidoId) return NextResponse.json({ error: 'Pedido obrigatório.' }, { status: 400 });

    const { error } = await supabase.rpc('liberar_credito_pedido', {
      p_pedido_id: String(pedidoId),
      p_cliente_id: user.id,
    });
    if (error) throw error;
    return NextResponse.json({ released: true });
  } catch (error: any) {
    const mensagem = error?.message || 'Não foi possível liberar a reserva do crédito.';
    const status = mensagem.includes('autenticad') || mensagem.includes('Sessão') ? 401 : 400;
    return NextResponse.json({ error: mensagem }, { status });
  }
}

