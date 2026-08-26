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
const { distribuirSabores, validarEscolhaPlano, datasPlano, dataBrasilia, somarDias, CONFIG_PLANO_INICIAL } = compiled.exports;
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
