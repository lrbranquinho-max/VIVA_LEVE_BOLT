export type StoreCoupon = {
  id: string;
  percentual_desconto: number;
  data_validade: string;
};

export type StoreDiscountBenefit = {
  percent: number;
  label: string;
};

function clampPercent(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
}

export function resolveCatalogCouponPreview(
  coupon: StoreCoupon | null | undefined,
  now = new Date(),
): StoreDiscountBenefit | null {
  if (!coupon) return null;
  const expiresAt = new Date(coupon.data_validade).getTime();
  const percent = clampPercent(coupon.percentual_desconto);
  if (!percent || !Number.isFinite(expiresAt) || expiresAt < now.getTime()) return null;
  return { percent, label: `${formatDiscountPercent(percent)} OFF no seu cupom` };
}

export function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateDiscountValue(value: number, percent: number) {
  return roundMoney(roundMoney(value) * clampPercent(percent) / 100);
}

export function calculateDiscountedPrice(value: number, percent: number) {
  const originalPrice = roundMoney(value);
  return roundMoney(originalPrice - calculateDiscountValue(originalPrice, percent));
}

export function formatDiscountPercent(percent: number) {
  return `${clampPercent(percent).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
