const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../components/NotificationCenter.tsx'), 'utf8');

test('sininho carrega somente notificações ainda não visualizadas', () => {
  assert.match(source, /\.is\('lida_em', null\)/);
  assert.match(source, /Nenhuma notificação nova\./);
});

test('visualizar uma notificação persiste leitura e a remove da lista', () => {
  assert.match(source, /async function abrirNotificacao/);
  assert.match(source, /update\(\{ lida_em: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(source, /lista\.filter\(atual => atual\.id !== item\.id\)/);
});

test('marcar todas ou fechar o painel remove notificações visualizadas', () => {
  assert.match(source, /async function fecharNotificacoes/);
  assert.match(source, /await marcarComoLidas\(\)/);
  assert.match(source, /lista\.filter\(item => !ids\.includes\(item\.id\)\)/);
});

test('atualização em outro dispositivo sincroniza a caixa de entrada', () => {
  assert.match(source, /event: 'UPDATE'/);
  assert.match(source, /\(\) => carregar\(data\.user!\.id\)/);
});
