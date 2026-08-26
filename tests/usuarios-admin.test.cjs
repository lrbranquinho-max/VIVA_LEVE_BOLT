const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../lib/usuariosAdmin.ts');
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { dadosUsuarioSchema, alternarPerfilUsuario, perfisAtivos, urlConviteUsuario } = compiled.exports;
const base = { nome: 'Aluno Teste', email: 'aluno@example.com', perfis: ['student'] };

test('aceita os quatro perfis existentes e normaliza e-mail', () => {
  for (const perfil of ['student', 'admin', 'trainer', 'delivery']) {
    const parsed = dadosUsuarioSchema.parse({ ...base, email: '  Aluno@EXAMPLE.com ', perfis: [perfil] });
    assert.equal(parsed.email, 'aluno@example.com');
    assert.deepEqual(parsed.perfis, [perfil]);
  }
});
test('rejeita dados incompletos, roles desconhecidas, e-mail e senha invalidos', () => {
  for (const data of [
    { ...base, nome: '' }, { ...base, perfis: [] }, { ...base, perfis: ['superadmin'] },
    { ...base, email: 'nao-e-email' }, { ...base, senha: '123' }, { ...base, userId: 'invalido' },
    { ...base, perfis: ['student', 'admin'] }, { ...base, email_confirm: true },
  ]) assert.equal(dadosUsuarioSchema.safeParse(data).success, false);
});
test('permite acumular perfis especiais sem duplicidade', () => {
  assert.deepEqual(dadosUsuarioSchema.parse({ ...base, perfis: ['admin', 'trainer', 'admin'] }).perfis, ['admin', 'trainer']);
});
test('aluno e o acesso comum, nao uma permissao administrativa', () => {
  assert.deepEqual(perfisAtivos([]), ['student']);
  assert.deepEqual(perfisAtivos([{ role: 'trainer', ativo: false }]), ['student']);
  assert.deepEqual(perfisAtivos([{ role: 'delivery', ativo: true }]), ['delivery']);
});
test('selecao remove o aluno quando escolhe acesso profissional e vice-versa', () => {
  assert.deepEqual(alternarPerfilUsuario(['student'], 'trainer'), ['trainer']);
  assert.deepEqual(alternarPerfilUsuario(['trainer'], 'admin'), ['trainer', 'admin']);
  assert.deepEqual(alternarPerfilUsuario(['trainer', 'admin'], 'student'), ['student']);
  assert.deepEqual(alternarPerfilUsuario(['trainer'], 'trainer'), ['student']);
});
test('convites usam HTTPS publico, nunca localhost ou origem externa', () => {
  for (const site of [undefined, '', 'http://localhost:3000', 'capacitor://localhost', 'https://outro.example', 'invalid', 'https://user:password@vivalevedf.com.br']) {
    assert.equal(urlConviteUsuario(site), 'https://vivalevedf.com.br/login?definir_senha=1');
  }
  assert.equal(urlConviteUsuario('https://www.vivalevedf.com.br/'), 'https://www.vivalevedf.com.br/login?definir_senha=1');
});
