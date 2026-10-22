import { calculateDiscountedPrice, StoreDiscountBenefit } from '@/lib/storeDiscounts';

function currency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DiscountPrice({ price, benefit, compact = false }: {
  price: number;
  benefit: StoreDiscountBenefit | null;
  compact?: boolean;
}) {
  if (!benefit) return <p className={`${compact ? 'text-base' : 'text-2xl'} font-extrabold text-viva-roxo`}>{currency(price)}</p>;

  return (
    <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
      <span className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-gray-400 line-through`}>{currency(price)}</span>
      <strong className={`${compact ? 'text-lg' : 'text-2xl'} text-viva-roxo`}>{currency(calculateDiscountedPrice(price, benefit.percent))}</strong>
      <span className="basis-full w-fit rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">{benefit.label}</span>
    </div>
  );
}
