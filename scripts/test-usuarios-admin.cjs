// Opt-in integration test against the configured Supabase. Creates only disposable test accounts.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadEnvConfig } = require('@next/env');
const { createClient } = require('@supabase/supabase-js');

if (process.env.RUN_SUPABASE_ADMIN_USERS_TESTS !== '1') {
  console.log('Defina RUN_SUPABASE_ADMIN_USERS_TESTS=1 para executar o teste integrado.');
  process.exit(0);
}
loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.equal(new URL(url).hostname, 'kdhdtdwayqdbkxbbpawm.supabase.co', 'Projeto Supabase inesperado');
assert.ok(key && anon, 'Credenciais locais do Supabase ausentes');
assert.ok(!/sua_|seu_|aqui|placeholder/i.test(key), 'Preencha a chave real de servidor do Supabase no .env.local antes deste teste');
const baseUrl = process.env.TEST_APP_URL || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname), 'Execute somente contra o app local');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const service = createClient(url, key, options);
const runId = crypto.randomUUID();
const senha = crypto.randomBytes(24).toString('base64url') + 'aA1!';
const emails = new Set();
let passes = 0;
function ok(label) { console.log(`PASS ${label}`); passes += 1; }
function emailFor(role) { const email = `qa-usuarios-${role}-${runId}@example.invalid`; emails.add(email); return email; }
async function api(method, token, body) {
  const result = await fetch(`${baseUrl}/api/admin/usuarios`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: result.status, data: await result.json() };
}
async function login(email) {
  const client = createClient(url, anon, options);
  const { data, error } = await client.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return { client, token: data.session.access_token };
}
async function cleanup() {
  for (let page = 1; ; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users.filter(item => emails.has(item.email))) {
      for (const [table, column, value] of [
        ['admin_usuario_roles', 'email', user.email], ['perfis_clientes', 'id', user.id], ['perfis', 'id', user.id],
      ]) {
        const { error: deleteError } = await service.from(table).delete().eq(column, value);
        if (deleteError) throw deleteError;
      }
      const { error: authError } = await service.auth.admin.deleteUser(user.id);
      if (authError) throw authError;
    }
    if (data.users.length < 1000) break;
  }
}

(async () => {
  try {
    for (const method of ['GET', 'POST', 'PATCH']) assert.equal((await api(method)).status, 401);
    ok('API bloqueia visitantes em todas as operacoes');
    const adminEmail = emailFor('fixture-admin');
    const created = await service.auth.admin.createUser({ email: adminEmail, password: senha, email_confirm: true });
    if (created.error) throw created.error;
    const adminId = created.data.user.id;
    const granted = await service.from('admin_usuario_roles').insert({ email: adminEmail, role: 'admin', nome: 'QA temporario', user_id: adminId, ativo: true });
    if (granted.error) throw granted.error;
    const { token } = await login(adminEmail);
    const contas = {};
    for (const role of ['student', 'trainer', 'admin', 'delivery']) {
      const body = { nome: `QA ${role}`, email: emailFor(role), telefone: '61999990000', senha, perfis: [role] };
      const response = await api('POST', token, body);
      assert.equal(response.status, 200, response.data.error);
      contas[role] = { ...body, userId: response.data.id };
      const { client, token: userToken } = await login(body.email);
      const access = await client.rpc('get_access_options', { lookup_email: body.email });
      if (access.error) throw access.error;
      assert.deepEqual(access.data, role === 'student' ? [] : [role]);
      for (const method of ['GET', 'POST', 'PATCH']) {
        if (role !== 'admin') assert.equal((await api(method, userToken, method === 'GET' ? undefined : body)).status, 403);
      }
      const direct = await client.rpc('admin_salvar_perfis_usuario', {
        p_ator_id: adminId, p_usuario_id: response.data.id, p_nome: 'Ataque bloqueado',
        p_telefone: '', p_observacoes: '', p_perfis: ['admin'],
      });
      assert.ok(direct.error, 'RPC privilegiada acessivel pelo navegador');
      await client.auth.signOut();
      ok(`Criacao, login, role e isolamento: ${role}`);
    }
    const listado = await api('GET', token);
    assert.equal(listado.status, 200, listado.data.error);
    for (const role of ['student', 'trainer', 'admin', 'delivery']) {
      assert.deepEqual(listado.data.usuarios.find(item => item.id === contas[role].userId).perfis, [role]);
    }
    ok('Listagem devolve os quatro perfis corretamente');
    const repetido = await api('POST', token, { nome: 'Nao alterar', email: adminEmail, perfis: ['student'] });
    assert.equal(repetido.status, 409);
    const proprio = await api('PATCH', token, { userId: adminId, nome: 'QA admin', email: adminEmail, perfis: ['student'] });
    assert.equal(proprio.status, 400);
    ok('Duplicidade e remocao do proprio acesso bloqueadas');

    const aluno = contas.student;
    const profile = await service.from('perfis_clientes').insert({ id: aluno.userId, nome_completo: aluno.nome, endereco_rua: 'Endereco QA preservado', peso_kg: 71 });
    if (profile.error) throw profile.error;
    const edit = await api('PATCH', token, { ...aluno, nome: 'QA Nome Atualizado', telefone: '61999990001', senha: '', perfis: ['trainer', 'delivery'] });
    assert.equal(edit.status, 200, edit.data.error);
    const saved = await service.from('perfis_clientes').select('nome_completo,telefone,endereco_rua,peso_kg').eq('id', aluno.userId).single();
    assert.equal(saved.data.nome_completo, 'QA Nome Atualizado');
    assert.equal(saved.data.telefone, '61999990001');
    assert.equal(saved.data.endereco_rua, 'Endereco QA preservado');
    assert.equal(saved.data.peso_kg, 71);
    const baseProfile = await service.from('perfis').select('nome').eq('id', aluno.userId).single();
    assert.equal(baseProfile.data.nome, 'QA Nome Atualizado');
    ok('Edicao sincroniza nome/telefone e preserva endereco e dados nutricionais');
    const remove = await api('PATCH', token, { ...aluno, senha: '', perfis: ['student'] });
    assert.equal(remove.status, 200, remove.data.error);
    const roles = await service.from('admin_usuario_roles').select('ativo').eq('email', aluno.email);
    assert.ok(roles.data.every(item => !item.ativo));
    ok('Remocao de permissoes especiais preserva conta e historico');

    const inviteEmail = emailFor('invite');
    const invite = await service.auth.admin.generateLink({ type: 'invite', email: inviteEmail, options: { redirectTo: 'https://vivalevedf.com.br/login?definir_senha=1' } });
    if (invite.error) throw invite.error;
    const redirect = new URL(invite.data.properties.action_link).searchParams.get('redirect_to');
    assert.equal(redirect, 'https://vivalevedf.com.br/login?definir_senha=1', 'Allowlist do convite precisa aceitar /login?definir_senha=1');
    const inviteClient = createClient(url, anon, options);
    const verified = await inviteClient.auth.verifyOtp({ type: 'invite', token_hash: invite.data.properties.hashed_token });
    if (verified.error) throw verified.error;
    const password = await inviteClient.auth.updateUser({ password: senha });
    if (password.error) throw password.error;
    await inviteClient.auth.signOut();
    ok('Convite sem envio de email: redirect publico, sessao e definicao de senha');
    console.log(`${passes} cenarios passaram.`);
  } finally {
    await cleanup();
    console.log('Contas temporarias removidas.');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
