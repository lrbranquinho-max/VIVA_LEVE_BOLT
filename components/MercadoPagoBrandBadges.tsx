interface MercadoPagoBrandBadgesProps {
  selected?: boolean;
}

export default function MercadoPagoBrandBadges({ selected = false }: MercadoPagoBrandBadgesProps) {
  const ring = selected ? 'ring-white/40' : 'ring-gray-200';

  return (
    <span
      className="mt-2 flex flex-wrap items-center justify-center gap-1"
      aria-label="Bandeiras aceitas pelo Mercado Pago: Visa, Mastercard, American Express, Hipercard, Elo e débito virtual CAIXA"
    >
      <span title="Visa" className={`flex h-4 min-w-7 items-center justify-center rounded-sm bg-white px-1 text-[6px] font-black italic text-[#1434CB] shadow-sm ring-1 ${ring}`}>VISA</span>
      <span title="Mastercard" className={`flex h-4 min-w-7 items-center justify-center rounded-sm bg-white px-1 shadow-sm ring-1 ${ring}`}>
        <span className="h-2.5 w-2.5 rounded-full bg-[#EB001B]" />
        <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-[#F79E1B] opacity-90" />
      </span>
      <span title="American Express" className={`flex h-4 min-w-7 items-center justify-center rounded-sm bg-[#016FD0] px-1 text-[5px] font-black leading-none text-white shadow-sm ring-1 ${ring}`}>AMEX</span>
      <span title="Hipercard" className={`flex h-4 min-w-7 items-center justify-center rounded-sm bg-[#B3131B] px-1 text-[5px] font-black text-white shadow-sm ring-1 ${ring}`}>HIPER</span>
      <span title="Elo" className={`flex h-4 min-w-7 items-center justify-center rounded-sm bg-[#111827] px-1 text-[6px] font-black lowercase text-[#FFCB05] shadow-sm ring-1 ${ring}`}>elo</span>
      <span title="Cartão de débito virtual CAIXA" className={`flex h-4 min-w-7 items-center justify-center rounded-sm bg-[#005CA9] px-1 text-[5px] font-black text-white shadow-sm ring-1 ${ring}`}>CAIXA</span>
    </span>
  );
}
