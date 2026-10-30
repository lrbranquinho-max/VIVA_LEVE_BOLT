import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { autenticarUsuarioApi } from '@/lib/apiAuth';
import { companyUpdateSchema } from '@/lib/company';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

class CompanyApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

async function exigirAdmin(request: NextRequest) {
  const contexto = await autenticarUsuarioApi(request).catch(() => { throw new CompanyApiError('Sessão inválida ou expirada.', 401); });
  const email = contexto.user.email?.trim().toLowerCase();
  if (!email) throw new CompanyApiError('Usuário sem e-mail.', 403);
  const { data, error } = await contexto.supabase.from('admin_usuario_roles').select('email')
    .eq('email', email).eq('role', 'admin').eq('ativo', true).maybeSingle();
  if (error) throw error;
  if (!data) throw new CompanyApiError('Acesso restrito a administradores.', 403);
  return contexto;
}

function errorResponse(error: unknown) {
  const status = error instanceof CompanyApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Não foi possível processar o cadastro da empresa.';
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await exigirAdmin(request);
    const { data, error } = await supabase.from('empresas').select('*').eq('principal', true).eq('ativo', true).maybeSingle();
    if (error) throw error;
    if (!data) throw new CompanyApiError('Nenhuma empresa principal ativa foi encontrada.', 404);
    return NextResponse.json({ empresa: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await exigirAdmin(request);
    let body: unknown;
    try { body = await request.json(); } catch { throw new CompanyApiError('Dados inválidos.', 400); }
    const parsed = companyUpdateSchema.safeParse(body);
    if (!parsed.success) throw new CompanyApiError(parsed.error.issues[0]?.message || 'Dados inválidos.', 400);
    const { data: current, error: currentError } = await supabase.from('empresas').select('*')
      .eq('principal', true).eq('ativo', true).maybeSingle();
    if (currentError) throw currentError;
    if (!current) throw new CompanyApiError('Nenhuma empresa principal ativa foi encontrada.', 404);

    const changes = Object.entries(parsed.data).filter(([field, value]) => JSON.stringify(current[field]) !== JSON.stringify(value));
    if (!changes.length) return NextResponse.json({ empresa: current, alteracoes: 0 });

    const { data: updated, error: updateError } = await supabase.from('empresas').update(parsed.data)
      .eq('id', current.id).select('*').single();
    if (updateError) throw updateError;
    const { error: auditError } = await supabase.from('empresa_auditoria').insert(changes.map(([field, value]) => ({
      empresa_id: current.id, administrador_id: user.id, campo: field,
      valor_anterior: current[field] === undefined ? null : current[field], valor_novo: value,
    })));
    if (auditError) throw auditError;
    revalidateTag('company-settings');
    return NextResponse.json({ empresa: updated, alteracoes: changes.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
