const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ler = arquivo => fs.readFileSync(path.resolve(__dirname, '..', arquivo), 'utf8');

const loja = ler('app/page.tsx');
const seletor = ler('components/PlanoKitSelector.tsx');
const dieta = ler('app/dieta/page.tsx');
const pedidos = ler('app/pedidos/page.tsx');
const migration = ler('supabase/migrations/20260923135715_checkout_entregas_notificacoes.sql');
const edge = ler('supabase/functions/dispatch-notifications/index.ts');
const worker = ler('worker/index.ts');
const admin = ler('app/admin/notificacoes/page.tsx');

test('frete grátis fica restrito a sacola exclusiva de kits programados para sábado', () => {
  assert.match(loja, /freteGratisKitSabado/);
  assert.match(loja, /tipo_produto === 'kit'/);
  assert.match(loja, /diaSemana\(escolha\.primeira_data\) === 6/);
  assert.match(migration, /frete:=case when apenas and kits_sabado then 0/);
  assert.doesNotMatch(loja, /LIMITE_FRETE_GRATIS/);
});

test('kit inicia em entrega única, próximo sábado e alerta sobre o benefício', () => {
  assert.match(seletor, /entregas: 1/);
  assert.match(seletor, /Você ganhou frete grátis para entrega no sábado/);
  assert.match(migration, /then 1 else/);
});

test('Cartão Alimentação fica disponível em sacola mista com kit', () => {
  assert.match(loja, /Object\.keys\(carrinho\)\.some/);
  assert.match(loja, /Cartão Alimentação — pagamento na primeira entrega/);
  assert.match(migration, /voucher_elegivel:=true/);
  assert.match(migration, /Itens avulsos de uma sacola mista são baixados uma única vez/);
});

test('notificações usam RLS, Vault, horário de Brasília e autenticação interna do cron', () => {
  assert.match(migration, /alter table public\.notification_schedules enable row level security/);
  assert.match(migration, /America\/Sao_Paulo/);
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /x-cron-secret/);
  assert.match(edge, /request\.headers\.get\('x-cron-secret'\)/);
  assert.doesNotMatch(edge, /VAPID_PRIVATE|OPENAI_API_KEY/);
  assert.match(admin, /Notificação única/);
  assert.match(admin, /Semanal/);
});

test('PWA recebe push e abre uma rota existente', () => {
  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /showNotification/);
  assert.match(worker, /addEventListener\('notificationclick'/);
  assert.match(edge, /url: '\/'/);
});

test('pedidos ativos pulsam e Plano Nutri informa o processamento', () => {
  assert.match(pedidos, /motion-safe:animate-pulse/);
  assert.match(dieta, /Aguarde alguns segundos\. Seu Plano Nutri está sendo gerado\./);
  assert.match(dieta, /animate-spin/);
});
