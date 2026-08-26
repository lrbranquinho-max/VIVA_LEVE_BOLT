const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { NextRequest } = require('next/server');

// Isolated route tests; these doubles never run in the application or touch Supabase.
function load(relative, dependencies = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = compiled.require.bind(compiled);
  compiled.require = name => dependencies[name] ?? original(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
  return compiled.exports;
}
const helpers = load('lib/usuariosAdmin.ts');
const actor = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.invalid' };
const target = { id: '22222222-2222-4222-8222-222222222222', email: 'aluno@example.invalid' };
const body = { nome: 'Aluno Teste', email: target.email, perfis: ['student'], senha: 'Senha-teste-123' };

function setup(options = {}) {
  const calls = [];
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() {
    return { data: options.nonAdmin ? null : { email: actor.email }, error: null };
  } };
  const supabase = {
    from: () => query,
    auth: { admin: {
      listUsers: async () => ({ data: { users: options.existing ? [target] : [] }, error: null }),
      getUserById: async id => ({ data: { user: id === actor.id ? actor : target }, error: null }),
      createUser: async input => { calls.push(['create', input]); return { data: { user: target }, error: null }; },
      inviteUserByEmail: async (email, input) => { calls.push(['invite', email, input]); return { data: { user: target }, error: null }; },
      updateUserById: async (id, input) => { calls.push(['password', id, input]); return { error: options.passwordError ? { message: 'Password refused' } : null }; },
    } },
    rpc: async (name, args) => { calls.push(['rpc', name, args]); return { error: options.rpcError ? { message: 'Database refused' } : null }; },
  };
  const route = load('app/api/admin/usuarios/route.ts', {
    '@/lib/usuariosAdmin': helpers,
    '@/lib/apiAuth': { autenticarUsuarioApi: async request => {
      if (!request.headers.get('authorization')) throw new Error('Not authenticated');
      if (options.configError) throw new Error('SUPABASE_SERVICE_ROLE_KEY nao configurada.');
      return { supabase, user: actor };
    } },
  });
  const request = (method, value = body, authenticated = true) => new NextRequest('http://localhost/api/admin/usuarios', {
    method,
    headers: authenticated ? { authorization: 'Bearer test-only', 'content-type': 'application/json' } : {},
    ...(method === 'GET' ? {} : { body: JSON.stringify(value) }),
  });
  return { route, calls, request };
}

test('GET, POST e PATCH bloqueiam ausencia de sessao ou usuario sem admin', async () => {
  for (const method of ['GET', 'POST', 'PATCH']) {
    const anonymous = setup();
    assert.equal((await anonymous.route[method](anonymous.request(method, body, false))).status, 401);
    const student = setup({ nonAdmin: true });
    assert.equal((await student.route[method](student.request(method))).status, 403);
    assert.equal(student.calls.length, 0);
  }
});

test('configuracao incompleta nao se confunde com sessao expirada', async () => {
  const { route, request } = setup({ configError: true });
  assert.equal((await route.GET(request('GET'))).status, 503);
});

test('cria cada perfil com o ator autenticado e a mesma conta Auth', async () => {
  for (const perfil of ['student', 'trainer', 'admin', 'delivery']) {
    const { route, request, calls } = setup();
    assert.equal((await route.POST(request('POST', { ...body, perfis: [perfil] }))).status, 200);
    assert.equal(calls[0][0], 'create');
    assert.equal(calls[1][1], 'admin_salvar_perfis_usuario');
    assert.equal(calls[1][2].p_ator_id, actor.id);
    assert.equal(calls[1][2].p_usuario_id, target.id);
    assert.deepEqual(calls[1][2].p_perfis, [perfil]);
  }
});

test('sem senha usa convite com retorno HTTPS e nao cria senha artificial', async () => {
  const { route, request, calls } = setup();
  const response = await route.POST(request('POST', { ...body, senha: '' }));
  assert.equal((await response.json()).conviteEnviado, true);
  assert.equal(calls[0][0], 'invite');
  const url = new URL(calls[0][2].redirectTo);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.searchParams.get('definir_senha'), '1');
});

test('duplicidade e payload invalido nao alteram contas existentes', async () => {
  const duplicate = setup({ existing: true });
  assert.equal((await duplicate.route.POST(duplicate.request('POST'))).status, 409);
  assert.equal(duplicate.calls.length, 0);
  for (const input of [{ ...body, perfis: ['superadmin'] }, { ...body, userId: target.id }, { ...body, p_ator_id: target.id }]) {
    const { route, request, calls } = setup();
    assert.equal((await route.POST(request('POST', input))).status, 400);
    assert.equal(calls.length, 0);
  }
});

test('edicao nao troca email, nao remove proprio admin e exige ID', async () => {
  for (const input of [body, { ...body, userId: target.id, email: 'outro@example.invalid' }, { ...body, userId: actor.id, email: actor.email }]) {
    const { route, request, calls } = setup();
    assert.equal((await route.PATCH(request('PATCH', input))).status, 400);
    assert.equal(calls.length, 0);
  }
});

test('edicao salva perfis sem criar conta nem alterar senha vazia', async () => {
  const { route, request, calls } = setup();
  assert.equal((await route.PATCH(request('PATCH', { ...body, userId: target.id, senha: '', perfis: ['trainer', 'delivery'] }))).status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'rpc');
});

test('falhas parciais sao explicadas em vez de anunciar sucesso', async () => {
  const created = setup({ rpcError: true });
  const response = await created.route.POST(created.request('POST'));
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /conta foi criada/);
  const changed = setup({ passwordError: true });
  const edited = await changed.route.PATCH(changed.request('PATCH', { ...body, userId: target.id }));
  assert.equal(edited.status, 409);
  assert.match((await edited.json()).error, /senha n.o foi alterada/);
});
