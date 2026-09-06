const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { NextRequest } = require('next/server');
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
const domain = load('lib/premium/domain.ts');
const plan = { code: 'completo', name: 'Completo', description: '', price_cents: 1590, duration_days: 30,
  resources: ['diet.generate','diet.advanced','training.access'], active: true, highlighted: true,
  renewable: true, display_order: 1, promotional_text: '' };
function setup(options = {}) {
  const calls = [];
  const query = { select() { return this; }, eq() { return this; }, order() { return this; },
    maybeSingle: async () => ({ data: options.nonAdmin ? null : { email: 'admin@example.invalid' }, error: null }),
    single: async () => ({ data: {}, error: null }), limit: async () => ({ data: [], error: null }),
    then(resolve) { resolve({ data: [], error: null }); } };
  const server = load('lib/premium/server.ts', { '@/lib/apiAuth': {
    autenticarUsuarioApi: async request => {
      if (!request.headers.get('authorization')) throw new Error('Missing auth');
      if (options.configError) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
      return { user: { id: 'test-admin', email: 'admin@example.invalid', email_confirmed_at: options.unverified ? null : '2026-01-01' },
        supabase: { from: () => query, rpc: async (name, args) => { calls.push([name, args]); return { data: 'plan-id', error: options.rpcError || null }; } } };
    },
  } });
  const route = load('app/api/admin/premium/route.ts', { '@/lib/premium/domain': domain, '@/lib/premium/server': server });
  const request = (method, body = plan, authenticated = true) => new NextRequest('http://localhost/api/admin/premium', {
    method, headers: authenticated ? { authorization: 'Bearer isolated-test' } : {},
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  return { route, request, calls };
}
test('API GET/POST exige sessao, email confirmado e papel admin', async () => {
  for (const method of ['GET','POST']) {
    for (const [options, authenticated, status] of [[{},false,401],[{nonAdmin:true},true,403],[{unverified:true},true,403]]) {
      const s = setup(options);
      assert.equal((await s.route[method](s.request(method, plan, authenticated))).status, status);
      assert.equal(s.calls.length, 0);
    }
  }
});
test('API salva apenas dados validados e usa ator autenticado', async () => {
  const s = setup();
  assert.equal((await s.route.POST(s.request('POST'))).status, 200);
  assert.equal(s.calls[0][0], 'premium_admin_save_plan');
  assert.equal(s.calls[0][1].p_actor_id, 'test-admin');
  assert.deepEqual(s.calls[0][1].p_data, plan);
});
test('configuracao incompleta retorna 503 e nao simula sessao expirada', async () => {
  const s = setup({ configError: true });
  assert.equal((await s.route.GET(s.request('GET'))).status, 503);
  assert.equal(s.calls.length, 0);
});
test('API recusa preco fracionado em centavos, duracao invalida e campos injetados', async () => {
  for (const patch of [{ price_cents: 1.2 }, { duration_days: 0 }, { price_cents: -1 }, { actor_id: 'attacker' },
    { resources: ['unknown'] }, { resources: [] }, { resources: ['diet.generate','diet.generate'] },
    { id: '10000000-0000-4000-8000-000000000001' }]) {
    const s = setup();
    assert.equal((await s.route.POST(s.request('POST', { ...plan, ...patch }))).status, 400);
    assert.equal(s.calls.length, 0);
  }
});
test('conflito de versao retorna 409', async () => {
  const s = setup({ rpcError: { message: 'Configuration changed; reload before saving', code: 'P0001' } });
  assert.equal((await s.route.POST(s.request('POST'))).status, 409);
});
test('falha do banco nao expoe mensagem interna', async () => {
  const s = setup({ rpcError: { message: 'internal-secret-fixture', code: 'XX000' } });
  const response = await s.route.POST(s.request('POST'));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('internal-secret-fixture'));
});
test('alerta respeita limite de cinco dias e nao alerta vencidos', () => {
  const now = new Date('2026-09-15T12:00:00Z');
  assert.equal(domain.expiryAlert('2026-09-20T12:00:00Z', 5, now), true);
  assert.equal(domain.expiryAlert('2026-09-20T12:00:01Z', 5, now), false);
  assert.equal(domain.expiryAlert(now.toISOString(), 5, now), false);
  assert.equal(domain.expiryAlert('invalid', 5, now), false);
  assert.equal(domain.remainingDays('2026-09-16T12:00:01Z', now), 2);
});
test('acesso exige inicio, validade e status; revisao nao remove dias', () => {
  const now = new Date('2026-09-15T12:00:00Z');
  const period = { start_at: '2026-09-01T00:00:00Z', expires_at: '2026-10-01T00:00:00Z', status: 'ACTIVE' };
  assert.equal(domain.periodIsActive(period, now), true);
  assert.equal(domain.periodIsActive({ ...period, status: 'REVIEW_REQUIRED' }, now), true);
  assert.equal(domain.periodIsActive({ ...period, status: 'CANCELLED' }, now), false);
  assert.equal(domain.periodIsActive({ ...period, expires_at: now.toISOString() }, now), false);
  assert.equal(domain.periodIsActive({ ...period, start_at: '2026-09-20T00:00:00Z' }, now), false);
});
