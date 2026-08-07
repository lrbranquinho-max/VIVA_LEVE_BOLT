import { NextRequest } from 'next/server';
import { criarSupabaseAdmin } from './supabaseAdmin';

export async function autenticarUsuarioApi(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Usuário não autenticado.');

  const supabase = criarSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error('Sessão inválida ou expirada.');

  return { supabase, user: data.user };
}

