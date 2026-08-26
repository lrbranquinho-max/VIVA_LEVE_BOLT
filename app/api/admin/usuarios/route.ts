import { NextRequest, NextResponse } from 'next/server';
import { autenticarUsuarioApi } from '@/lib/apiAuth';
import { dadosUsuarioSchema, perfisAtivos, urlConviteUsuario, UsuarioAdmin } from '@/lib/usuariosAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

class ErroUsuario extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function exigirAdmin(request: NextRequest) {
  const contexto = await autenticarUsuarioApi(request).catch((error: Error) => {
    if (error.message.includes('SUPABASE_')) throw new ErroUsuario(error.message, 503);
    throw new ErroUsuario('Sessão inválida ou expirada. Entre novamente.', 401);
  });
  const email = contexto.user.email?.trim().toLowerCase();
  if (!email) throw new ErroUsuario('Usuário sem e-mail.', 403);
  const { data, error } = await contexto.supabase.from('admin_usuario_roles')
    .select('email').eq('email', email).eq('role', 'admin').eq('ativo', true).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroUsuario('Acesso restrito a administradores.', 403);
  return contexto;
}

type Contexto = Awaited<ReturnType<typeof exigirAdmin>>;

async function* paginasAuth(supabase: Contexto['supabase']) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    yield data.users;
    if (data.users.length < 100) return;
  }
}

function erroResposta(error: unknown) {
  const mensagem = error instanceof Error ? error.message : String((error as { message?: string })?.message || 'Não foi possível concluir a operação.');
  const status = error instanceof ErroUsuario ? error.status : 500;
  return NextResponse.json({ error: mensagem }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await exigirAdmin(request);
    const usuarios: UsuarioAdmin[] = [];
    // Batches stay below PostgREST row and URL limits, even with several roles per account.
    for await (const pagina of paginasAuth(supabase)) {
      const contas = pagina.filter(usuario => usuario.email);
      if (!contas.length) continue;
      const ids = contas.map(usuario => usuario.id);
      const emails = contas.map(usuario => usuario.email!.toLowerCase());
      const [rolesResult, perfisResult, clientesResult] = await Promise.all([
        supabase.from('admin_usuario_roles').select('email,role,nome,ativo,telefone,observacoes').in('email', emails),
        supabase.from('perfis').select('id,nome,telefone').in('id', ids),
        supabase.from('perfis_clientes').select('id,nome_completo,telefone').in('id', ids),
      ]);
      if (rolesResult.error) throw rolesResult.error;
      if (perfisResult.error) throw perfisResult.error;
      if (clientesResult.error) throw clientesResult.error;
      for (const usuario of contas) {
        const email = usuario.email!.toLowerCase();
        const perfil = perfisResult.data.find(item => item.id === usuario.id);
        const cliente = clientesResult.data.find(item => item.id === usuario.id);
        const roles = rolesResult.data.filter(item => item.email.toLowerCase() === email);
        const referencia = roles.find(role => role.ativo) ?? roles[0];
        usuarios.push({
          id: usuario.id, email,
          nome: cliente?.nome_completo || perfil?.nome || referencia?.nome || String(usuario.user_metadata?.nome ?? '') || email.split('@')[0],
          telefone: cliente?.telefone || perfil?.telefone || referencia?.telefone || '',
          observacoes: referencia?.observacoes || '',
          perfis: perfisAtivos(roles),
          criadoEm: usuario.created_at,
          ultimoAcesso: usuario.last_sign_in_at ?? null,
          emailConfirmado: Boolean(usuario.email_confirmed_at),
        });
      }
    }
    usuarios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return NextResponse.json({ usuarios }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return erroResposta(error); }
}

async function salvarUsuario(request: NextRequest, edicao: boolean) {
  let contaCriada = false;
  let dadosSalvos = false;
  try {
    const { supabase, user: administrador } = await exigirAdmin(request);
    let body: unknown;
    try { body = await request.json(); } catch { throw new ErroUsuario('Dados de cadastro inválidos.', 400); }
    const parsed = dadosUsuarioSchema.safeParse(body);
    if (!parsed.success) throw new ErroUsuario(parsed.error.issues[0].message, 400);
    const { userId, nome, email, telefone, observacoes, senha, perfis } = parsed.data;
    if (edicao && !userId) throw new ErroUsuario('Informe o usuário que será editado.', 400);
    if (!edicao && userId) throw new ErroUsuario('Utilize a edição para uma conta existente.', 400);

    let usuario;
    let conviteEnviado = false;
    if (edicao) {
      const { data, error } = await supabase.auth.admin.getUserById(userId!);
      if (error || !data.user) throw new ErroUsuario('Usuário não encontrado.', 404);
      usuario = data.user;
      if (usuario.email?.toLowerCase() !== email) throw new ErroUsuario('O e-mail de login não pode ser alterado nesta tela.', 400);
      if (usuario.id === administrador.id && !perfis.includes('admin')) {
        throw new ErroUsuario('Você não pode remover o próprio acesso administrativo.', 400);
      }
    } else {
      for await (const pagina of paginasAuth(supabase)) {
        if (pagina.some(item => item.email?.toLowerCase() === email)) {
          throw new ErroUsuario('Este e-mail já possui uma conta. Localize o usuário e clique em Editar para alterar os perfis.', 409);
        }
      }
      const resultado = senha
        ? await supabase.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome, telefone } })
        : await supabase.auth.admin.inviteUserByEmail(email, {
          data: { nome, telefone }, redirectTo: urlConviteUsuario(process.env.NEXT_PUBLIC_SITE_URL),
        });
      if (resultado.error) throw resultado.error;
      if (!resultado.data.user) throw new ErroUsuario('O Supabase não retornou o usuário criado.', 502);
      usuario = resultado.data.user;
      contaCriada = true;
      conviteEnviado = !senha;
    }

    const { error: perfilError } = await supabase.rpc('admin_salvar_perfis_usuario', {
      p_ator_id: administrador.id, p_usuario_id: usuario.id,
      p_nome: nome, p_telefone: telefone, p_observacoes: observacoes, p_perfis: perfis,
    });
    if (perfilError) throw perfilError;
    dadosSalvos = true;
    if (edicao && senha) {
      const { error } = await supabase.auth.admin.updateUserById(usuario.id, { password: senha });
      if (error) throw new ErroUsuario(`Dados e perfis salvos, mas a senha não foi alterada: ${error.message}`, 409);
    }
    return NextResponse.json({ id: usuario.id, email, conviteEnviado });
  } catch (error) {
    if (contaCriada && !dadosSalvos) {
      const mensagem = (error as { message?: string })?.message || 'Erro no banco.';
      return erroResposta(new ErroUsuario(`A conta foi criada, mas os perfis não foram salvos. Localize o usuário e edite novamente. ${mensagem}`, 409));
    }
    return erroResposta(error);
  }
}

export async function POST(request: NextRequest) { return salvarUsuario(request, false); }
export async function PATCH(request: NextRequest) { return salvarUsuario(request, true); }
