const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), 'utf8');
const admin = ler('app/admin/page.tsx');
const loja = ler('app/page.tsx');
const financeiro = ler('supabase/migrations/20261013143030_ajustar_pedidos_descontos_notificacoes_admin.sql');
const notificacao = ler('supabase/migrations/20261013143301_notificar_admin_novo_pedido.sql');
const edge = ler('supabase/functions/dispatch-notifications/index.ts');
const centro = ler('components/NotificationCenter.tsx');

test('gestão de pedidos consulta e resume somente os últimos 30 dias', () => {
  assert.match(admin, /PEDIDOS_ADMIN_DIAS = 30/);
  assert.match(admin, /\.gte\('criado_em', inicioPeriodoPedidos\(\)\)/);
  assert.doesNotMatch(admin, /\.from\('pedidos'\)[\s\S]{0,100}\.select\('\*'\)/);
  assert.match(admin, /Período consultado: últimos \{PEDIDOS_ADMIN_DIAS\} dias/);
});

test('cada pedido apresenta valor, frete, desconto e total pago', () => {
  for (const rotulo of ['Valor pedido', 'Frete', 'Desconto', 'Total pago']) assert.match(admin, new RegExp(rotulo));
  assert.match(admin, /subtotal_produtos,valor_frete,desconto_percentual,desconto_valor/);
  assert.match(admin, /subtotalPedido\(pedido\)/);
});

test('loja remove desconto automático por valor e limita aviso da sacola aos kits', () => {
  assert.doesNotMatch(loja, /LIMITE_DESCONTO_AUTOMATICO|DESCONTO_AUTOMATICO_PERCENTUAL|descontoAutomatico/);
  assert.doesNotMatch(loja, /Compras acima de/);
  assert.match(loja, /\{temPlanos && <div[\s\S]{0,250}Kits programados para entrega aos sábados têm frete grátis\./);
  assert.match(loja, /Math\.max\(descontoCupomPercentual, descontoDiaDPercentual\)/);
});

test('banco elimina frete grátis por valor e aceita somente cupom ou Dia D', () => {
  assert.match(financeiro, /new\.checkout_idempotencia is null[\s\S]*new\.valor_frete/);
  assert.match(financeiro, /cupom_dia_d_ativo/);
  assert.match(financeiro, /public\.cupons_desconto/);
  assert.match(financeiro, /desconto_automatico_percentual/);
  assert.doesNotMatch(financeiro, /subtotal[^\n]*>=\s*(100|300)/i);
});

test('novo pedido notifica somente contas administrativas e abre a gestão', () => {
  assert.match(notificacao, /after insert on public\.pedidos/);
  assert.match(notificacao, /x-cron-secret/);
  assert.match(edge, /\.eq\('role', 'admin'\)\.eq\('ativo', true\)/);
  assert.match(edge, /pedido_id,user_id/);
  assert.match(edge, /url: '\/admin'/);
  assert.match(centro, /notification\.data\?\.url/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY[^\n]*NEXT_PUBLIC/);
});
