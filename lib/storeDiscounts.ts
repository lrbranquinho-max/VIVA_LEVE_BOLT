export type StoreCoupon = {
  id: string;
  percentual_desconto: number;
  data_validade: string;
};

export type StoreDiscountBenefit = {
  percent: number;
  source: 'user_coupon' | 'dia_d';
  couponId: string | null;
  label: string;
  campaign: string;
};

export type StoreDiscountConfig = {
  cupom_dia_d_ativo?: boolean;
  cupom_dia_d_percentual?: number;
};

function clampPercent(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
}

export function activeStoreCoupons(coupons: StoreCoupon[], now = new Date()) {
  return coupons.filter(coupon => {
    const expiresAt = new Date(coupon.data_validade).getTime();
    return clampPercent(coupon.percentual_desconto) > 0 && Number.isFinite(expiresAt) && expiresAt >= now.getTime();
  });
}

export function bestStoreCoupon(coupons: StoreCoupon[], now = new Date()) {
  return activeStoreCoupons(coupons, now).sort((left, right) => {
    const percentDifference = clampPercent(right.percentual_desconto) - clampPercent(left.percentual_desconto);
    if (percentDifference !== 0) return percentDifference;
    return new Date(left.data_validade).getTime() - new Date(right.data_validade).getTime();
  })[0] ?? null;
}

export function resolveStoreDiscount(
  coupon: StoreCoupon | null | undefined,
  config: StoreDiscountConfig,
  now = new Date(),
): StoreDiscountBenefit | null {
  const validCoupon = coupon && activeStoreCoupons([coupon], now)[0];
  const couponPercent = clampPercent(validCoupon?.percentual_desconto);
  const diaDPercent = config.cupom_dia_d_ativo ? clampPercent(config.cupom_dia_d_percentual) : 0;

  // Empates ficam com a promoção automática para não consumir um cupom individual sem benefício adicional.
  if (validCoupon && couponPercent > diaDPercent) {
    return {
      percent: couponPercent,
      source: 'user_coupon',
      couponId: validCoupon.id,
      label: `${formatDiscountPercent(couponPercent)} OFF no seu cupom`,
      campaign: 'user_coupon',
    };
  }

  if (diaDPercent > 0) {
    return {
      percent: diaDPercent,
      source: 'dia_d',
      couponId: null,
      label: `${formatDiscountPercent(diaDPercent)} OFF Dia D`,
      campaign: 'dia_d',
    };
  }

  return null;
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

export function discountAnalyticsProperties(originalPrice: number, benefit: StoreDiscountBenefit | null) {
  const normalizedOriginal = roundMoney(originalPrice);
  return {
    original_price: normalizedOriginal,
    discount_percent: benefit?.percent ?? 0,
    final_price: benefit ? calculateDiscountedPrice(normalizedOriginal, benefit.percent) : normalizedOriginal,
    discount_campaign: benefit?.campaign ?? 'none',
    discount_coupon_id: benefit?.couponId ?? undefined,
    has_discount: Boolean(benefit),
  };
}

export function formatDiscountPercent(percent: number) {
  return `${clampPercent(percent).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
