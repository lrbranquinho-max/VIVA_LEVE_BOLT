import Link from 'next/link';

type BottomNavItem = 'loja' | 'pedidos' | 'dieta' | 'treino' | 'perfil';

const ITEMS: Array<{ id: BottomNavItem; href: string; label: string; icon: string }> = [
  { id: 'loja', href: '/', label: 'Loja', icon: '/nav-icons/loja.png' },
  { id: 'pedidos', href: '/pedidos', label: 'Pedidos', icon: '/nav-icons/pedidos.png' },
  { id: 'dieta', href: '/dieta', label: 'Dieta', icon: '/nav-icons/dieta.png' },
  { id: 'treino', href: '/meu-treino', label: 'Treino', icon: '/nav-icons/treino.png' },
  { id: 'perfil', href: '/perfil', label: 'Perfil', icon: '/nav-icons/perfil.png' },
];

export default function BottomNav({ active }: { active: BottomNavItem }) {
  return (
    <nav className="fixed bottom-0 z-10 flex w-full max-w-md justify-around border-t border-gray-200 bg-white p-2 pb-5 md:max-w-6xl">
      {ITEMS.map(item => {
        const isActive = item.id === active;
        const className = `flex min-w-0 flex-1 flex-col items-center text-center transition ${isActive ? 'text-viva-roxo' : 'text-gray-400 hover:text-viva-roxo'}`;
        const content = (
          <>
            <span className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-md bg-white ${isActive ? 'ring-2 ring-viva-verde' : ''}`}>
              <img src={item.icon} alt="" className="h-full w-full object-contain" aria-hidden="true" />
            </span>
            <span className="mt-1 text-[10px] font-bold leading-none">{item.label}</span>
          </>
        );

        if (isActive) {
          return (
            <span key={item.id} className={className} aria-current="page">
              {content}
            </span>
          );
        }

        return (
          <Link key={item.id} href={item.href} className={className}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
