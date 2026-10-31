import { NextRequest } from 'next/server';
import { autenticarUsuarioApi } from '@/lib/apiAuth';

export class FiscalApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }

export async function requireFiscalAdmin(request: NextRequest) {
  const context = await autenticarUsuarioApi(request).catch(() => { throw new FiscalApiError('Sessão inválida ou expirada.', 401); });
  const email = context.user.email?.trim().toLowerCase();
  if (!email) throw new FiscalApiError('Usuário sem e-mail.', 403);
  const { data, error } = await context.supabase.from('admin_usuario_roles').select('email').eq('email', email).eq('role', 'admin').eq('ativo', true).maybeSingle();
  if (error) throw error;
  if (!data) throw new FiscalApiError('Acesso restrito a administradores.', 403);
  return context;
}
