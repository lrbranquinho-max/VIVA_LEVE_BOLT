const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../lib/cuponsAdmin.ts');
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { novoCupomAdminSchema, situacaoCupom, usuarioEhEquipe } = compiled.exports;

const clienteId = '11111111-1111-4111-8111-111111111111';
test('valida os dados aceitos para um novo cupom administrativo', () => {
  assert.equal(novoCupomAdminSchema.safeParse({ clienteId, percentual: 15, dataValidade: '2026-12-31T23:59:59-03:00' }).success, true);
  for (const payload of [
    { clienteId: 'invalido', percentual: 15, dataValidade: '2026-12-31T23:59:59-03:00' },
    { clienteId, percentual: 0, dataValidade: '2026-12-31T23:59:59-03:00' },
    { clienteId, percentual: 101, dataValidade: '2026-12-31T23:59:59-03:00' },
    { clienteId, percentual: 10.123, dataValidade: '2026-12-31T23:59:59-03:00' },
    { clienteId, percentual: 10, dataValidade: '31/12/2026' },
  ]) assert.equal(novoCupomAdminSchema.safeParse(payload).success, false);
});

test('separa cupom ativo, expirado e utilizado', () => {
  const agora = new Date('2026-10-02T12:00:00-03:00');
  assert.equal(situacaoCupom({ status: 'aberto', data_validade: '2026-10-03T00:00:00-03:00' }, agora), 'ativo');
  assert.equal(situacaoCupom({ status: 'aberto', data_validade: '2026-10-01T23:59:59-03:00' }, agora), 'expirado');
  assert.equal(situacaoCupom({ status: 'finalizado', data_validade: '2026-10-03T00:00:00-03:00' }, agora), 'utilizado');
});

test('identifica descontos vinculados a perfis da equipe', () => {
  assert.equal(usuarioEhEquipe(['student']), false);
  assert.equal(usuarioEhEquipe(['admin']), true);
  assert.equal(usuarioEhEquipe(['trainer', 'delivery']), true);
});

test('API e página usam autenticação administrativa e não expõem a service role', () => {
  const route = fs.readFileSync(path.resolve(__dirname, '../app/api/admin/cupons/route.ts'), 'utf8');
  const page = fs.readFileSync(path.resolve(__dirname, '../app/admin/cupons/page.tsx'), 'utf8');
  assert.match(route, /autenticarUsuarioApi/);
  assert.match(route, /admin_usuario_roles/);
  assert.match(route, /auth\.admin\.getUserById/);
  assert.doesNotMatch(page, /SERVICE_ROLE|SERVICE_KEY|auth\.admin/);
  assert.match(page, /nome ou e-mail/i);
  assert.match(page, /Todas as situações/);
  assert.match(page, /Toda a equipe/);
});
