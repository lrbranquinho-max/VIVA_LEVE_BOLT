import { NextRequest, NextResponse } from 'next/server';
import { autenticarUsuarioApi } from '@/lib/apiAuth';
import { novoCupomAdminSchema } from '@/lib/cuponsAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPOS = 'id,cliente_id,percentual_desconto,criado_em,data_validade,data_utilizacao,status';

class ErroCupom extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function exigirAdmin(request: NextRequest) {
  const contexto = await autenticarUsuarioApi(request).catch((error: Error) => {
    if (error.message.includes('SUPABASE_')) throw new ErroCupom(error.message, 503);
    throw new ErroCupom('Sessão inválida ou expirada. Entre novamente.', 401);
  });
  const email = contexto.user.email?.trim().toLowerCase();
  if (!email) throw new ErroCupom('Usuário sem e-mail.', 403);
  const { data, error } = await contexto.supabase.from('admin_usuario_roles')
    .select('email').eq('email', email).eq('role', 'admin').eq('ativo', true).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroCupom('Acesso restrito a administradores.', 403);
  return contexto;
}

function respostaErro(error: unknown) {
  const mensagem = error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
  const status = error instanceof ErroCupom ? error.status : 500;
  return NextResponse.json({ error: mensagem }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await exigirAdmin(request);
    const { data, error } = await supabase.from('cupons_desconto').select(CAMPOS).order('criado_em', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ cupons: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return respostaErro(error); }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await exigirAdmin(request);
    let body: unknown;
    try { body = await request.json(); } catch { throw new ErroCupom('Dados do cupom inválidos.', 400); }
    const parsed = novoCupomAdminSchema.safeParse(body);
    if (!parsed.success) throw new ErroCupom(parsed.error.issues[0].message, 400);
    const { clienteId, percentual, dataValidade } = parsed.data;
    const validade = new Date(dataValidade);
    if (validade.getTime() <= Date.now()) throw new ErroCupom('A validade precisa estar no futuro.', 400);

    const { data: conta, error: contaError } = await supabase.auth.admin.getUserById(clienteId);
    if (contaError || !conta.user) throw new ErroCupom('Cliente não encontrado.', 404);

    const { data: duplicado, error: duplicadoError } = await supabase.from('cupons_desconto')
      .select('id').eq('cliente_id', clienteId).eq('status', 'aberto')
      .eq('percentual_desconto', percentual).gte('data_validade', new Date().toISOString()).limit(1);
    if (duplicadoError) throw duplicadoError;
    if (duplicado?.length) throw new ErroCupom(`O cliente já possui um cupom ativo de ${percentual}%.`, 409);

    if (percentual === 30) {
      const { data: trinta, error: trintaError } = await supabase.from('cupons_desconto')
        .select('id').eq('cliente_id', clienteId).eq('percentual_desconto', 30).limit(1);
      if (trintaError) throw trintaError;
      if (trinta?.length) throw new ErroCupom('Este cliente já possui histórico do cupom único de 30%. Use outro percentual.', 409);
    }

    const { data, error } = await supabase.from('cupons_desconto').insert({
      cliente_id: clienteId,
      percentual_desconto: percentual,
      data_validade: validade.toISOString(),
      status: 'aberto',
    }).select(CAMPOS).single();
    if (error) throw error;
    return NextResponse.json({ cupom: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return respostaErro(error); }
}
