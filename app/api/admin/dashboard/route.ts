import { NextRequest, NextResponse } from 'next/server';
import { autenticarUsuarioApi } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RegistroUso = { user_id: string; data: string };

class ErroDashboard extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function exigirAdmin(request: NextRequest) {
  const contexto = await autenticarUsuarioApi(request).catch((error: Error) => {
    if (error.message.includes('SUPABASE_')) throw new ErroDashboard(error.message, 503);
    throw new ErroDashboard('Sessão inválida ou expirada. Entre novamente.', 401);
  });
  const email = contexto.user.email?.trim().toLowerCase();
  if (!email) throw new ErroDashboard('Usuário sem e-mail.', 403);
  const { data, error } = await contexto.supabase.from('admin_usuario_roles')
    .select('email').eq('email', email).eq('role', 'admin').eq('ativo', true).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroDashboard('Acesso restrito a administradores.', 403);
  return contexto;
}

async function contar(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function buscarTodos(
  carregar: (inicio: number, fim: number) => PromiseLike<{ data: RegistroUso[] | null; error: { message: string } | null }>,
) {
  const resultado: RegistroUso[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await carregar(inicio, inicio + 999);
    if (error) throw error;
    const pagina = data ?? [];
    resultado.push(...pagina);
    if (pagina.length < 1000) return resultado;
  }
}

function usuariosPorPeriodo(registros: RegistroUso[], desde7d: string, desde24h: string) {
  const distintos = (filtro: (item: RegistroUso) => boolean) => new Set(registros.filter(filtro).map(item => item.user_id)).size;
  return {
    total: distintos(() => true),
    ultimos7Dias: distintos(item => item.data >= desde7d),
    ultimas24Horas: distintos(item => item.data >= desde24h),
  };
}

function classePagamento(valor: string | null) {
  const status = (valor ?? '').trim().toLowerCase();
  if (['approved', 'completed', 'paid', 'pago', 'balcao'].includes(status)) return 'concluido';
  if (['rejected', 'refused', 'denied', 'cancelled', 'canceled', 'cancelado'].includes(status)) return 'recusado';
  return 'pendente';
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await exigirAdmin(request);
    const agora = new Date();
    const desde24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const desde7d = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [clientesTotal, clientes7d, clientes24h, acessos24h, pedidosResult, nutri, treino] = await Promise.all([
      contar(supabase.from('perfis_clientes').select('id', { count: 'exact', head: true })),
      contar(supabase.from('perfis_clientes').select('id', { count: 'exact', head: true }).gte('criado_em', desde7d)),
      contar(supabase.from('perfis_clientes').select('id', { count: 'exact', head: true }).gte('criado_em', desde24h)),
      contar(supabase.from('loja_acessos').select('id', { count: 'exact', head: true }).gte('acessado_em', desde24h)),
      supabase.from('pedidos').select('pagamento_status').eq('tipo_venda', 'online').is('pedido_origem_id', null).gte('criado_em', desde24h),
      buscarTodos((inicio, fim) => supabase.from('planos_gerados').select('user_id,data:criado_em').order('criado_em').range(inicio, fim) as never),
      buscarTodos((inicio, fim) => supabase.from('training_profiles').select('user_id,data:created_at').order('created_at').range(inicio, fim) as never),
    ]);

    if (pedidosResult.error) throw pedidosResult.error;
    const pagamentos = { pendente: 0, recusado: 0, concluido: 0 };
    (pedidosResult.data ?? []).forEach(item => { pagamentos[classePagamento(item.pagamento_status)] += 1; });

    return NextResponse.json({
      atualizadoEm: agora.toISOString(),
      clientes: { total: clientesTotal, ultimos7Dias: clientes7d, ultimas24Horas: clientes24h },
      acessosLoja: { ultimas24Horas: acessos24h },
      pedidos24h: pagamentos,
      planoNutri: usuariosPorPeriodo(nutri, desde7d, desde24h),
      plataformaTreino: usuariosPorPeriodo(treino, desde7d, desde24h),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : 'Não foi possível carregar o dashboard.';
    const status = error instanceof ErroDashboard ? error.status : 500;
    return NextResponse.json({ error: mensagem }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
