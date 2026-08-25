import { NextRequest, NextResponse } from 'next/server';
import { autenticarUsuarioApi } from '@/lib/apiAuth';

export const runtime = 'nodejs';

async function exigirAdmin(request: NextRequest) {
  const contexto = await autenticarUsuarioApi(request);
  const email = contexto.user.email?.trim().toLowerCase();
  if (!email) throw new Error('Usuário administrativo sem e-mail.');
  const { data, error } = await contexto.supabase
    .from('admin_usuario_roles')
    .select('email')
    .eq('email', email)
    .eq('role', 'admin')
    .eq('ativo', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Acesso restrito a administradores.');
  return contexto;
}

async function localizarUsuarioPorEmail(supabase: Awaited<ReturnType<typeof exigirAdmin>>['supabase'], email: string) {
  for (let pagina = 1; pagina <= 10; pagina += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: 100 });
    if (error) throw error;
    const encontrado = data.users.find(usuario => usuario.email?.toLowerCase() === email);
    if (encontrado || data.users.length < 100) return encontrado ?? null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await exigirAdmin(request);
    const body = await request.json() as {
      nome?: string; email?: string; telefone?: string; observacoes?: string;
      senha?: string; ativo?: boolean;
    };
    const nome = String(body.nome ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const senha = String(body.senha ?? '');
    if (!nome || !email.includes('@')) return NextResponse.json({ error: 'Informe nome e e-mail válidos.' }, { status: 400 });
    if (senha && senha.length < 8) return NextResponse.json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, { status: 400 });

    let usuario = await localizarUsuarioPorEmail(supabase, email);
    let conviteEnviado = false;
    if (!usuario) {
      if (senha) {
        const { data, error } = await supabase.auth.admin.createUser({
          email, password: senha, email_confirm: true, user_metadata: { nome },
        });
        if (error) throw error;
        usuario = data.user;
      } else {
        const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://vivalevedf.com.br').replace(/\/$/, '');
        const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
          data: { nome }, redirectTo: `${site}/login`,
        });
        if (error) throw error;
        usuario = data.user;
        conviteEnviado = true;
      }
    }

    const { error: roleError } = await supabase.from('admin_usuario_roles').upsert({
      email,
      role: 'delivery',
      nome,
      telefone: String(body.telefone ?? '').trim() || null,
      observacoes: String(body.observacoes ?? '').trim() || null,
      user_id: usuario.id,
      ativo: body.ativo !== false,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'email,role' });
    if (roleError) throw roleError;

    return NextResponse.json({ id: usuario.id, email, conviteEnviado });
  } catch (error: any) {
    const mensagem = error?.message || 'Não foi possível cadastrar o entregador.';
    const status = mensagem.includes('autentic') ? 401 : mensagem.includes('restrito') ? 403 : 500;
    return NextResponse.json({ error: mensagem }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await exigirAdmin(request);
    const body = await request.json() as {
      userId?: string; email?: string; nome?: string; telefone?: string;
      observacoes?: string; senha?: string; ativo?: boolean;
    };
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!email) return NextResponse.json({ error: 'Entregador não informado.' }, { status: 400 });
    if (body.senha && body.senha.length < 8) return NextResponse.json({ error: 'A senha deve ter pelo menos 8 caracteres.' }, { status: 400 });

    const { error } = await supabase.from('admin_usuario_roles').update({
      nome: String(body.nome ?? '').trim(),
      telefone: String(body.telefone ?? '').trim() || null,
      observacoes: String(body.observacoes ?? '').trim() || null,
      ativo: body.ativo !== false,
      atualizado_em: new Date().toISOString(),
    }).eq('email', email).eq('role', 'delivery');
    if (error) throw error;

    if (body.userId && body.senha) {
      const { error: senhaError } = await supabase.auth.admin.updateUserById(body.userId, { password: body.senha });
      if (senhaError) throw senhaError;
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const mensagem = error?.message || 'Não foi possível atualizar o entregador.';
    const status = mensagem.includes('autentic') ? 401 : mensagem.includes('restrito') ? 403 : 500;
    return NextResponse.json({ error: mensagem }, { status });
  }
}
