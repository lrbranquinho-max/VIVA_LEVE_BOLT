import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { criarSupabaseAdmin } from '@/lib/supabaseAdmin';
import { authenticatedUser } from '@/lib/metaConversionsServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const postSchema = z.object({ pedidoId: z.number().int().positive(), sessaoId: z.string().uuid() }).strict();

export async function POST(request: NextRequest) {
  try {
    const user = await authenticatedUser(request.headers.get('authorization'));
    if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    const input = postSchema.parse(await request.json());
    const admin = criarSupabaseAdmin();
    const [{ data: pedido }, { data: acesso }] = await Promise.all([
      admin.from('pedidos').select('id,cliente_id').eq('id', input.pedidoId).maybeSingle(),
      admin.from('loja_acessos').select('first_touch,last_touch').eq('sessao_id', input.sessaoId).maybeSingle(),
    ]);
    if (!pedido || pedido.cliente_id !== user.id) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    const { error } = await admin.from('pedidos').update({
      analytics_sessao_id: input.sessaoId, analytics_first_touch: acesso?.first_touch || {}, analytics_last_touch: acesso?.last_touch || {},
    }).eq('id', input.pedidoId).eq('cliente_id', user.id);
    if (error) throw error;
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    console.error('[Analytics pedido] Falha:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Não foi possível vincular o pedido.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await authenticatedUser(request.headers.get('authorization'));
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const pedidoId = Number(request.nextUrl.searchParams.get('pedidoId'));
  if (!Number.isInteger(pedidoId) || pedidoId <= 0) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  const admin = criarSupabaseAdmin();
  const { data } = await admin.from('loja_eventos').select('event_id,propriedades,pedidos!inner(cliente_id,pagamento_status)').eq('pedido_id', pedidoId).eq('event_name', 'purchase').eq('pedidos.cliente_id', user.id).eq('pedidos.pagamento_status', 'approved').maybeSingle();
  if (!data) return NextResponse.json({ error: 'Compra ainda não confirmada.' }, { status: 404 });
  return NextResponse.json({ eventId: data.event_id, propriedades: data.propriedades }, { headers: { 'Cache-Control': 'no-store' } });
}
