const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.resolve(__dirname, '../lib/planosMarmitas.ts');
const compiled = new Module(file, module);
compiled.filename = file;
compiled.paths = Module._nodeModulePaths(path.dirname(file));
compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, file);
const { distribuirSabores, distribuirSaboresComEstoque, distribuirSelecaoParcialComEstoque, validarEscolhaPlano, validarEstoqueEscolhaPlano, datasPlano, dataBrasilia, primeiraEntregaPadrao, somarDias, CONFIG_PLANO_INICIAL, opcoesEntregasPlano, configurarEntregasPlano, validarEntregasPlano } = compiled.exports;
for (const [total, n, esperado] of [[24,3,[8,8,8]],[24,4,[6,6,6,6]],[24,5,[5,5,5,5,4]],[14,3,[5,5,4]],[14,4,[4,4,3,3]],[14,5,[3,3,3,3,2]]]) {
  test('distribuicao ' + total + '/' + n, () => {
    const result = distribuirSabores(total, Array.from({ length:n }, (_,i)=>i+1));
    assert.deepEqual(result.map(s=>s.quantidade), esperado);
    assert.equal(validarEscolhaPlano({ ...CONFIG_PLANO_INICIAL, total_marmitas:total }, result), '');
  });
}
test('recusa sabores insuficientes, excessivos, repetidos, fracionados e total incorreto', () => {
  for (const sabores of [
    [{id:1,quantidade:7},{id:2,quantidade:7}],
    Array.from({length:6},(_,i)=>({id:i+1,quantidade:i<2?3:2})),
    [{id:1,quantidade:5},{id:1,quantidade:5},{id:2,quantidade:4}],
    [{id:1,quantidade:5.5},{id:2,quantidade:4.5},{id:3,quantidade:4}],
    [{id:1,quantidade:0},{id:2,quantidade:7},{id:3,quantidade:7}],
    [{id:1,quantidade:6},{id:2,quantidade:5},{id:3,quantidade:4}],
  ]) assert.notEqual(validarEscolhaPlano(CONFIG_PLANO_INICIAL,sabores),'');
});
test('aceita ajuste manual sem exigir equilibrio', () => {
  assert.equal(validarEscolhaPlano(CONFIG_PLANO_INICIAL,[{id:1,quantidade:6},{id:2,quantidade:4},{id:3,quantidade:4}]),'');
});
test('datas semanais preservam dia entre meses e anos', () => {
  assert.deepEqual(datasPlano('2026-12-23',{...CONFIG_PLANO_INICIAL,entregas:4}),['2026-12-23','2026-12-30','2027-01-06','2027-01-13']);
  assert.equal(somarDias('2028-02-28',1),'2028-02-29');
});
test('virada do dia em Brasilia, independentemente do fuso do servidor', () => {
  assert.equal(dataBrasilia(new Date('2026-09-01T02:59:59Z')),'2026-08-31');
  assert.equal(dataBrasilia(new Date('2026-09-01T03:00:00Z')),'2026-09-01');
});
test('distribuicao do kit respeita estoque disponivel por sabor', () => {
  const produtos = [{ id: 1, estoque_disponivel: 2 }, { id: 2, estoque_disponivel: 5 }, { id: 3, estoque_disponivel: 10 }];
  const escolha = distribuirSaboresComEstoque(14, produtos);
  assert.equal(escolha.reduce((s, i) => s + i.quantidade, 0), 14);
  assert.deepEqual(escolha.map(i => i.quantidade), [2, 5, 7]);
  assert.equal(distribuirSaboresComEstoque(18, produtos).length, 0);
  assert.equal(distribuirSaboresComEstoque(3, [{ id: 1, estoque_disponivel: 0 }, ...produtos.slice(1)]).length, 0);
});
test('selecao progressiva permite marcar sabor mesmo sem estoque para completar o kit sozinho', () => {
  const produtos = [{ id: 1, estoque_disponivel: 12 }, { id: 2, estoque_disponivel: 8 }, { id: 3, estoque_disponivel: 4 }];
  const primeiro = distribuirSelecaoParcialComEstoque(14, produtos.slice(0, 1));
  assert.deepEqual(primeiro, [{ id: 1, quantidade: 12 }]);
  const dois = distribuirSelecaoParcialComEstoque(14, produtos.slice(0, 2));
  assert.equal(dois.reduce((soma, item) => soma + item.quantidade, 0), 14);
  assert.deepEqual(dois, [{ id: 1, quantidade: 7 }, { id: 2, quantidade: 7 }]);
  const tres = distribuirSelecaoParcialComEstoque(24, produtos);
  assert.equal(tres.reduce((soma, item) => soma + item.quantidade, 0), 24);
  assert.deepEqual(tres, [{ id: 1, quantidade: 12 }, { id: 2, quantidade: 8 }, { id: 3, quantidade: 4 }]);
});
test('validacao identifica sabor esgotado ou quantidade acima do disponivel', () => {
  const produtos = [{ id: 1, nome: 'A', estoque_disponivel: 0 }, { id: 2, nome: 'B', estoque_disponivel: 2 }];
  assert.match(validarEstoqueEscolhaPlano([{ id: 1, quantidade: 1 }], produtos), /esgotado/);
  assert.match(validarEstoqueEscolhaPlano([{ id: 2, quantidade: 3 }], produtos), /insuficiente/);
  assert.equal(validarEstoqueEscolhaPlano([{ id: 2, quantidade: 2 }], produtos), '');
});
test('primeira entrega padrao fica no proximo sabado no horario de Brasilia', () => {
  assert.equal(primeiraEntregaPadrao(new Date('2026-09-01T02:59:59Z')),'2026-09-05');
  assert.equal(primeiraEntregaPadrao(new Date('2026-09-01T03:00:00Z')),'2026-09-05');
  assert.equal(primeiraEntregaPadrao(new Date('2026-12-30T15:00:00Z')),'2027-01-02');
  assert.equal(primeiraEntregaPadrao(new Date('2026-09-05T15:00:00Z')),'2026-09-12');
});
test('kit de 14 permite uma ou duas entregas e recalcula a quantidade por etapa', () => {
  const config = { ...CONFIG_PLANO_INICIAL, total_marmitas: 14, entregas: 2, marmitas_por_entrega: 7 };
  assert.deepEqual(opcoesEntregasPlano(config), [1, 2]);
  assert.deepEqual(configurarEntregasPlano(config, 1), { ...config, entregas: 1, marmitas_por_entrega: 14 });
  assert.equal(validarEntregasPlano(config, 1), '');
  assert.notEqual(validarEntregasPlano(config, 4), '');
});
test('kit de 24 permite uma, duas ou quatro entregas', () => {
  const config = { ...CONFIG_PLANO_INICIAL, total_marmitas: 24, entregas: 4, marmitas_por_entrega: 6 };
  assert.deepEqual(opcoesEntregasPlano(config), [1, 2, 4]);
  assert.equal(configurarEntregasPlano(config, 2).marmitas_por_entrega, 12);
  assert.equal(validarEntregasPlano(config, 2), '');
  assert.notEqual(validarEntregasPlano(config, 3), '');
});
