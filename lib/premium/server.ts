import { NextRequest, NextResponse } from 'next/server';
import { autenticarUsuarioApi } from '@/lib/apiAuth';

export class PremiumError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function premiumUser(request: NextRequest) {
  let context;
  try { context = await autenticarUsuarioApi(request); }
  catch (error) {
    if (error instanceof Error && error.message.includes('SUPABASE_')) {
      throw new PremiumError('Configuração de servidor pendente. Contate o administrador.', 503);
    }
    throw new PremiumError('Entre novamente para continuar.', 401);
  }
  if (!context.user.email_confirmed_at) throw new PremiumError('Confirme seu email para continuar.', 403);
  return context;
}

export async function premiumAdmin(request: NextRequest) {
  const context = await premiumUser(request);
  const { data, error } = await context.supabase.from('admin_usuario_roles').select('email')
    .eq('email', context.user.email!.trim().toLowerCase()).eq('role', 'admin').eq('ativo', true).maybeSingle();
  if (error) throw new PremiumError('Não foi possível verificar a permissão.', 503);
  if (!data) throw new PremiumError('Acesso restrito a administradores.', 403);
  return context;
}

export function premiumResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function premiumFailure(error: unknown) {
  // Database messages, request payloads and credentials are intentionally not exposed.
  return premiumResponse({ error: error instanceof PremiumError ? error.message : 'Não foi possível concluir a operação de planos.' },
    error instanceof PremiumError ? error.status : 503);
}
