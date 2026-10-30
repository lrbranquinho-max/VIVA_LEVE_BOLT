const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTs(relative) {
  const file = path.resolve(process.cwd(), relative);
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = Module._nodeModulePaths(path.dirname(file));
  compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, file);
  return compiled.exports;
}

const company = loadTs('lib/company.ts');
const read = file => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('valida e formata CNPJ estruturalmente', () => {
  assert.equal(company.validarCnpj('62.496.248/0001-42'), true);
  assert.equal(company.formatarCnpj('62496248000142'), '62.496.248/0001-42');
  assert.equal(company.validarCnpj('11.111.111/1111-11'), false);
  assert.equal(company.validarCnpj('62.496.248/0001-41'), false);
});

test('schema aceita personalização completa e rejeita CNPJ, URL e cor inválidos', () => {
  const base = { ...company.DEFAULT_COMPANY };
  for (const field of ['id','slug','principal','ativo']) delete base[field];
  assert.equal(company.companyUpdateSchema.safeParse({ ...base, nome_fantasia: 'Empresa X', logo_url: 'https://cdn.example/logo.webp', cor_primaria: '#123ABC', whatsapp: '5561999999999' }).success, true);
  assert.equal(company.companyUpdateSchema.safeParse({ ...base, cnpj: '11111111111111' }).success, false);
  assert.equal(company.companyUpdateSchema.safeParse({ ...base, site: 'javascript:alert(1)' }).success, false);
  assert.equal(company.companyUpdateSchema.safeParse({ ...base, cor_primaria: 'roxo' }).success, false);
});

test('fallback sem logo e sem cor mantém nome e tema padrão', () => {
  const fallback = { ...company.DEFAULT_COMPANY, logo_url: null, cor_primaria: null, cor_botao: null };
  const css = company.companyCssVariables(fallback);
  assert.equal(fallback.nome_fantasia, 'Viva Leve');
  assert.equal(css['--brand-primary'], '#4B0082');
  assert.equal(css['--brand-primary-rgb'], '75 0 130');
  assert.equal(css['--brand-button'], '#BFFF00');
});

test('redes sociais vazias não geram links no shell', () => {
  const source = read('components/AppShell.tsx');
  assert.match(source, /company\.whatsapp &&/);
  assert.match(source, /company\.instagram_url &&/);
});

test('migração cria empresa principal, RLS, auditoria, storage e vínculos futuros', () => {
  const sql = read('supabase/migrations/20261030184155_central_cadastro_empresa.sql');
  assert.match(sql, /create table public\.empresas/);
  assert.match(sql, /unique index empresas_uma_principal_uidx/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /empresa_auditoria/);
  assert.match(sql, /empresa-assets/);
  assert.match(sql, /file_size_limit, allowed_mime_types/);
  assert.match(sql, /app_config add column if not exists empresa_id/);
  assert.match(sql, /on delete restrict/);
  assert.doesNotMatch(sql, /on delete cascade[\s\S]*empresa_auditoria/);
});

test('API exige administrador, valida no servidor, persiste, audita e revalida cache', () => {
  const source = read('app/api/admin/empresa/route.ts');
  assert.match(source, /eq\('role', 'admin'\)\.eq\('ativo', true\)/);
  assert.match(source, /companyUpdateSchema\.safeParse/);
  assert.match(source, /from\('empresas'\)\.update/);
  assert.match(source, /from\('empresa_auditoria'\)\.insert/);
  assert.match(source, /revalidateTag\('company-settings'\)/);
});

test('tema, metadata e manifest usam a empresa ativa com fallback', () => {
  const layout = read('app/layout.tsx');
  const manifest = read('app/manifest.ts');
  assert.match(layout, /getCompanySettingsServer/);
  assert.match(layout, /CompanySettingsProvider/);
  assert.match(layout, /companyCssVariables/);
  assert.match(manifest, /company\.nome_fantasia/);
  assert.match(manifest, /company\.cor_primaria/);
});

test('adapter fiscal consome cadastro-mestre sem duplicar dados cadastrais', () => {
  const source = read('lib/companyFiscal.ts');
  for (const field of ['company.cnpj','company.razao_social','company.inscricao_estadual','company.regime_tributario','company.codigo_municipio_ibge']) assert.match(source, new RegExp(field.replace('.', '\\.')));
});

test('áreas institucionais migradas não mantêm contatos ou CNPJ literais', () => {
  for (const file of ['components/StoreFooter.tsx','app/termos-de-uso/page.tsx','app/politica-de-privacidade/page.tsx','app/faq/page.tsx','app/politica-de-entregas-e-reembolso/page.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /62\.496\.248|556191299996|vivaleve\.df@gmail\.com/, file);
  }
});
