const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadDiscountModule() {
  const source = fs.readFileSync(path.join(process.cwd(), 'lib/storeDiscounts.ts'), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'require', javascript)(module, module.exports, require);
  return module.exports;
}

const discounts = loadDiscountModule();
const now = new Date('2026-10-22T12:00:00-03:00');
const coupon = (id, percent, expiration = '2026-11-22T12:00:00-03:00') => ({
  id, percentual_desconto: percent, data_validade: expiration,
});

test('cliente de primeira compra usa o cupom real de 10%, sem regra hardcoded de primeira compra', () => {
  const benefit = discounts.resolveStoreDiscount(coupon('00000000-0000-4000-8000-000000000010', 10), {}, now);
  assert.equal(benefit.percent, 10);
  assert.equal(benefit.source, 'user_coupon');
  assert.equal(discounts.calculateDiscountedPrice(399.90, benefit.percent), 359.91);
});

test('seleciona o maior cupom ativo e usa validade como desempate', () => {
  const selected = discounts.bestStoreCoupon([
    coupon('00000000-0000-4000-8000-000000000010', 10),
    coupon('00000000-0000-4000-8000-000000000015', 15),
    coupon('00000000-0000-4000-8000-000000000014', 15, '2026-11-01T12:00:00-03:00'),
  ], now);
  assert.equal(selected.id, '00000000-0000-4000-8000-000000000014');
});

test('cliente logado sem cupom e visitante sem Dia D não recebem mensagem nem preço promocional', () => {
  assert.equal(discounts.resolveStoreDiscount(null, { cupom_dia_d_ativo: false, cupom_dia_d_percentual: 20 }, now), null);
  assert.equal(discounts.resolveStoreDiscount(undefined, {}, now), null);
});

test('visitante recebe Dia D apenas quando a promoção automática está realmente ativa', () => {
  const benefit = discounts.resolveStoreDiscount(null, { cupom_dia_d_ativo: true, cupom_dia_d_percentual: 12 }, now);
  assert.equal(benefit.source, 'dia_d');
  assert.equal(benefit.percent, 12);
  assert.equal(benefit.couponId, null);
});

test('cupom expirado não é anunciado nem calculado', () => {
  const expired = coupon('00000000-0000-4000-8000-000000000001', 25, '2026-10-21T12:00:00-03:00');
  assert.equal(discounts.bestStoreCoupon([expired], now), null);
  assert.equal(discounts.resolveStoreDiscount(expired, {}, now), null);
});

test('Dia D vence empate sem consumir cupom individual e maior benefício vence conflitos', () => {
  const tied = discounts.resolveStoreDiscount(coupon('00000000-0000-4000-8000-000000000010', 10), { cupom_dia_d_ativo: true, cupom_dia_d_percentual: 10 }, now);
  assert.equal(tied.source, 'dia_d');
  assert.equal(tied.couponId, null);
  const couponWins = discounts.resolveStoreDiscount(coupon('00000000-0000-4000-8000-000000000015', 15), { cupom_dia_d_ativo: true, cupom_dia_d_percentual: 10 }, now);
  assert.equal(couponWins.source, 'user_coupon');
  assert.equal(couponWins.percent, 15);
});

test('arredondamento do catálogo replica o desconto monetário do banco/checkout', () => {
  assert.equal(discounts.calculateDiscountValue(337, 15), 50.55);
  assert.equal(discounts.calculateDiscountedPrice(337, 15), 286.45);
  const properties = discounts.discountAnalyticsProperties(337, discounts.resolveStoreDiscount(coupon('00000000-0000-4000-8000-000000000015', 15), {}, now));
  assert.deepEqual(properties, {
    original_price: 337, discount_percent: 15, final_price: 286.45,
    discount_campaign: 'user_coupon', discount_coupon_id: '00000000-0000-4000-8000-000000000015', has_discount: true,
  });
});

test('checkout revalida cupom/configuração e usa o financeiro persistido antes do gateway', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8');
  assert.match(source, /cuponsAtuaisRes/);
  assert.match(source, /financeiroConfirmado/);
  assert.match(source, /Nenhum pagamento foi iniciado/);
  assert.match(source, /p_cupom_id: cupomEfetivoId/);
  assert.match(source, /cupom_id: cupomEfetivoId/);
});

test('schema atual não inventa restrição por produto: benefício elegível é global ao subtotal', () => {
  const benefit = discounts.resolveStoreDiscount(coupon('00000000-0000-4000-8000-000000000015', 15), {}, now);
  assert.equal(discounts.calculateDiscountedPrice(20, benefit.percent), 17);
  assert.equal(discounts.calculateDiscountedPrice(100, benefit.percent), 85);
});
