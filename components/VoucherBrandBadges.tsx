interface VoucherBrandBadgesProps {
  bandeiras?: Record<string, boolean>;
  selected?: boolean;
}

const BANDEIRAS = [
  { nome: 'Ticket', rotulo: 'TICKET', classe: 'bg-[#E31837] text-white' },
  { nome: 'Pluxee', rotulo: 'pluxee', classe: 'bg-[#2D155F] text-white' },
  { nome: 'Alelo', rotulo: 'alelo', classe: 'bg-[#00A859] text-white' },
  { nome: 'VR', rotulo: 'VR', classe: 'bg-[#1D3C8F] text-[#F58220]' },
] as const;

export default function VoucherBrandBadges({ bandeiras, selected = false }: VoucherBrandBadgesProps) {
  const habilitadas = BANDEIRAS.filter(({ nome }) => bandeiras?.[nome] !== false);
  if (!habilitadas.length) return null;

  return (
    <span
      className="mt-2 flex flex-wrap items-center justify-center gap-1"
      aria-label={`Bandeiras de voucher aceitas: ${habilitadas.map(({ nome }) => nome).join(', ')}`}
    >
      {habilitadas.map(({ nome, rotulo, classe }) => (
        <span
          key={nome}
          title={nome === 'Ticket' ? 'Ticket Alimentacao' : nome}
          className={`flex h-4 min-w-8 items-center justify-center rounded-sm px-1 text-[6px] font-black shadow-sm ring-1 ${classe} ${selected ? 'ring-white/40' : 'ring-gray-200'}`}
        >
          {rotulo}
        </span>
      ))}
    </span>
  );
}
