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

const { ordenarProdutosLoja, valoresNutricionaisParaExibicao } = carregarModulo('../lib/storeProducts.ts');
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

test('exibe nutrientes da marmita e do caldo pela porcao total', () => {
  const base100g = { porcao_g: 350, kcal: 120, proteinas: 10, carboidratos: 20, gorduras: 5, tipo_produto: 'avulso' };
  assert.deepEqual(valoresNutricionaisParaExibicao({ ...base100g, categoria: 'Marmitas' }), {
    kcal: 420,
    proteinas: 35,
    carboidratos: 70,
    gorduras: 17.5,
    referentePorcaoTotal: true,
  });
  assert.deepEqual(valoresNutricionaisParaExibicao({ ...base100g, categoria: 'Caldos', porcao_g: 300 }), {
    kcal: 360,
    proteinas: 30,
    carboidratos: 60,
    gorduras: 15,
    referentePorcaoTotal: true,
  });
});

test('mantem valores cadastrados para suplementos, outros produtos e kits', () => {
  const base100g = { porcao_g: 900, kcal: 100, proteinas: 25, carboidratos: 8, gorduras: 2, tipo_produto: 'avulso' };
  for (const produto of [
    { ...base100g, categoria: 'Suplementos' },
    { ...base100g, categoria: 'Proteínas' },
    { ...base100g, categoria: 'Marmitas', tipo_produto: 'kit' },
  ]) {
    assert.deepEqual(valoresNutricionaisParaExibicao(produto), {
      kcal: 100,
      proteinas: 25,
      carboidratos: 8,
      gorduras: 2,
      referentePorcaoTotal: false,
    });
  }
});
