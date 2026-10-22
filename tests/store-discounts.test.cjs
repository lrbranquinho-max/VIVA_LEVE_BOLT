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
const coupon = (percent, expiration = '2026-11-22T12:00:00-03:00') => ({
  id: '00000000-0000-4000-8000-000000000010',
  percentual_desconto: percent,
  data_validade: expiration,
});

test('prévia do catálogo usa o percentual do cupom já selecionado', () => {
  const benefit = discounts.resolveCatalogCouponPreview(coupon(10), now);
  assert.deepEqual(benefit, { percent: 10, label: '10% OFF no seu cupom' });
  assert.equal(discounts.calculateDiscountedPrice(399.90, benefit.percent), 359.91);
});

test('catálogo não anuncia cupom ausente, zerado ou expirado', () => {
  assert.equal(discounts.resolveCatalogCouponPreview(null, now), null);
  assert.equal(discounts.resolveCatalogCouponPreview(coupon(0), now), null);
  assert.equal(discounts.resolveCatalogCouponPreview(coupon(25, '2026-10-21T12:00:00-03:00'), now), null);
});

test('catálogo apenas exibe o cupom que o fluxo existente já selecionou', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8');
  assert.match(source, /setCupomSelecionadoId\(lista\[0\]\?\.id \?\? ''\)/);
  assert.match(source, /resolveCatalogCouponPreview\(cupons\[0\]\)/);
  assert.match(source, /<DiscountPrice price=\{Number\(item\.preco\)\} benefit=\{beneficioVisualCatalogo\} compact \/>/);
});

test('prévia visual não altera cálculo da sacola nem total enviado ao pagamento', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8');
  assert.match(source, /const descontoCupomPercentual = Number\(cupomSelecionado\?\.percentual_desconto \?\? 0\)/);
  assert.match(source, /const descontoPercentual = Math\.max\(descontoCupomPercentual, descontoDiaDPercentual\)/);
  assert.match(source, /const descontoValor = subtotalProdutos \* \(descontoPercentual \/ 100\)/);
  assert.match(source, /Math\.max\(subtotalProdutos - descontoValor \+ valorFrete, 0\)/);
});

test('prévia visual permanece restrita à página do catálogo', () => {
  const detail = fs.readFileSync(path.join(process.cwd(), 'app/produto/[id]/page.tsx'), 'utf8');
  const kit = fs.readFileSync(path.join(process.cwd(), 'components/PlanoKitSelector.tsx'), 'utf8');
  assert.doesNotMatch(detail, /DiscountPrice|resolveCatalogCouponPreview|discountBenefit/);
  assert.doesNotMatch(kit, /DiscountPrice|StoreDiscountBenefit|discountBenefit/);
});
