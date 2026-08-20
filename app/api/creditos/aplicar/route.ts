import { NextRequest, NextResponse } from 'next/server';
import { autenticarUsuarioApi } from '../../../../lib/apiAuth';
import { validarLiberacaoVendas } from '../../../../lib/orderStock';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await autenticarUsuarioApi(request);
    const { pedidoId, chave } = await request.json() as { pedidoId?: string | number; chave?: string };
    if (!pedidoId || !String(chave ?? '').trim()) {
      return NextResponse.json({ error: 'Pedido e chave de crédito são obrigatórios.' }, { status: 400 });
    }

    await validarLiberacaoVendas(supabase);

    const { data, error } = await supabase.rpc('aplicar_credito_pedido', {
      p_pedido_id: String(pedidoId),
      p_chave: String(chave).trim(),
      p_cliente_id: user.id,
      p_cliente_email: user.email ?? '',
    });
    if (error) throw error;

    const resultado = data as {
      credito_id: number;
      valor_aplicado: number;
      valor_restante: number;
      quitado: boolean;
    };

    if (resultado.quitado) {
      const { error: cupomError } = await supabase.rpc('finalizar_cupom_pedido', {
        p_pedido_id: String(pedidoId),
      });
      if (cupomError) throw cupomError;
    }

    return NextResponse.json(resultado);
  } catch (error: any) {
    const mensagem = error?.message || 'Não foi possível aplicar a chave de crédito.';
    const status = mensagem.includes('autenticad') || mensagem.includes('Sessão') ? 401 : 400;
    return NextResponse.json({ error: mensagem }, { status });
  }
}
