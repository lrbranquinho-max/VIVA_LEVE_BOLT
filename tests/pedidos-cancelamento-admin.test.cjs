const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), 'utf8');
const migration = ler('supabase/migrations/20260917120000_cancelamento_admin_pedidos_nao_pagos.sql');
const admin = ler('app/admin/page.tsx');
const entregas = ler('app/admin/entregas/page.tsx');
const api = ler('app/api/admin/pedidos/[id]/cancelar/route.ts');
const preference = ler('app/api/mercadopago/preference/route.ts');
const current = ler('supabase/migrations/20260923135715_checkout_entregas_notificacoes.sql');

test('cancelamento é lógico, auditável e restrito a administradores', () => {
  assert.match(migration, /cancelado_admin_em timestamptz/i);
  assert.match(migration, /cancelado_admin_por uuid references auth\.users/i);
  assert.match(migration, /cancelamento_admin_motivo text/i);
  assert.match(migration, /not public\.is_viva_leve_admin\(\)/i);
  assert.match(migration, /pago_em is not null/i);
  assert.match(migration, /pagamento_status[\s\S]*approved[\s\S]*paid[\s\S]*pago[\s\S]*balcao/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.pedidos/i);
});

test('cancelamento libera crédito reservado e aciona o fluxo já existente dos kits', () => {
  assert.match(migration, /credito_status = 'reservado'/i);
  assert.match(migration, /liberar_credito_pedido/i);
  assert.match(migration, /set status = 'Cancelado'/i);
});

test('admin e entregas escondem cancelados e entregas rejeitam pedidos sem pagamento', () => {
  assert.match(admin, /Cancelar pedido/);
  assert.match(admin, /\.is\('cancelado_admin_em', null\)/);
  assert.match(entregas, /pedidoAptoParaGestaoDeEntrega/);
  assert.match(entregas, /\.filter\(pedidoAptoParaGestaoDeEntrega\)/);
  assert.match(entregas, /\.is\('cancelado_admin_em', null\)/);
});

test('pedido raiz de Cartão Alimentação pendente pode ser cancelado e propaga às entregas', () => {
  assert.match(current, /checkout_idempotencia is not null and v\.meio_pagamento='voucher_presencial'/);
  assert.match(current, /Cancele o pedido principal, não uma entrega do kit/);
  assert.match(admin, /kitCartaoAlimentacao/);
  assert.match(admin, /cancela as entregas abertas do kit/i);
});

test('rota server-side invalida pagamento ou preferência sem expor credenciais', () => {
  assert.match(api, /is_viva_leve_admin/);
  assert.match(api, /MERCADOPAGO_ACCESS_TOKEN/);
  assert.match(api, /\/v1\/payments\//);
  assert.match(api, /\/checkout\/preferences\//);
  assert.match(api, /cancelar_pedido_nao_pago_admin/);
  assert.doesNotMatch(admin, /MERCADOPAGO_ACCESS_TOKEN/);
});

test('novas preferências têm vigência limitada a três dias', () => {
  assert.match(preference, /expires: true/);
  assert.match(preference, /3 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(preference, /expiration_date_to/);
});
