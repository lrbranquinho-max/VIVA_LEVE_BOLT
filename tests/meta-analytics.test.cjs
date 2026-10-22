const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Purchase nasce somente da aprovação server-side do pedido raiz', () => {
  const sql = read('supabase/migrations/20261022155351_meta_conversoes_atribuicao_funil.sql');
  assert.match(sql, /new\.pedido_origem_id is not null/);
  assert.match(sql, /new\.pagamento_status[^;]+approved/s);
  assert.match(sql, /old\.pagamento_status[^;]+approved/s);
  assert.match(sql, /loja_eventos_purchase_pedido_key/);
});

test('browser e CAPI usam o mesmo event_id para deduplicação', () => {
  const browser = read('lib/storeAnalytics.ts');
  const edge = read('supabase/functions/meta-conversions/index.ts');
  assert.match(browser, /eventID: eventId/);
  assert.match(edge, /event_id: event\.event_id/);
});

test('token CAPI nunca faz parte do bundle público', () => {
  const client = read('lib/storeAnalytics.ts');
  const env = read('.env.example');
  assert.doesNotMatch(client, /META_CAPI_ACCESS_TOKEN/);
  assert.doesNotMatch(env, /^META_CAPI_ACCESS_TOKEN=/m);
  assert.match(read('supabase/functions/meta-conversions/index.ts'), /Deno\.env\.get\('META_CAPI_ACCESS_TOKEN'\)/);
});

test('eventos exigidos e atribuição estão cobertos', () => {
  const client = read('lib/storeAnalytics.ts');
  for (const name of ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase']) assert.match(client, new RegExp(name));
  for (const field of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'fbc', 'fbp', 'referrer', 'landing_page']) assert.match(client, new RegExp(field));
});

test('analytics consulta somente campos necessários', () => {
  for (const file of ['app/api/analytics/event/route.ts', 'app/api/analytics/pedido/route.ts', 'supabase/functions/meta-conversions/index.ts']) {
    assert.doesNotMatch(read(file), /\.select\(['"]\*['"]\)/, file);
  }
});

test('CAPI tem outbox, retry limitado e nunca bloqueia pagamento', () => {
  const sql = read('supabase/migrations/20261022160025_meta_conversoes_dispatch.sql');
  const edge = read('supabase/functions/meta-conversions/index.ts');
  assert.match(sql, /insert into public\.meta_capi_entregas/);
  assert.match(sql, /exception when others/);
  assert.match(sql, /\*\/5 \* \* \* \*/);
  assert.match(edge, /lt\('tentativas', 6\)/);
  assert.match(edge, /waiting_configuration/);
});
