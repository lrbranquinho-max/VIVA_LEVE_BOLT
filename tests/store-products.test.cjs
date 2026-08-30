const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function carregarModulo(caminho) {
  const file = path.resolve(__dirname, caminho);
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = Module._nodeModulePaths(path.dirname(file));
  compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, file);
  return compiled.exports;
}

const { ordenarProdutosLoja } = carregarModulo('../lib/storeProducts.ts');
const { DEFAULT_STORE_LAUNCH_AT, vendasDaLojaLiberadas } = carregarModulo('../lib/storeLaunch.ts');

test('ordena kits, marmitas e demais categorias nessa sequencia', () => {
  const produtos = [
    { nome: 'Suco', categoria: 'Bebidas', tipo_produto: 'avulso' },
    { nome: 'Marmita B', categoria: 'Marmitas', tipo_produto: 'avulso' },
    { nome: 'Plano Z', categoria: 'Marmitas', tipo_produto: 'kit' },
    { nome: 'Plano A', categoria: null, tipo_produto: 'kit' },
    { nome: 'Marmita A', categoria: 'mÁrmitas', tipo_produto: 'avulso' },
  ];

  assert.deepEqual(ordenarProdutosLoja(produtos).map(item => item.nome), [
    'Plano A', 'Plano Z', 'Marmita A', 'Marmita B', 'Suco',
  ]);
});

test('fallback da loja ja esta liberado', () => {
  assert.equal(DEFAULT_STORE_LAUNCH_AT, '2020-01-01T00:00:00-03:00');
  assert.equal(vendasDaLojaLiberadas(undefined, Date.parse('2026-08-30T00:00:00-03:00')), true);
});
