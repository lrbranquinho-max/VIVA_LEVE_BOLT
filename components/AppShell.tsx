"use client";

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppDownloadPrompt from './AppDownloadPrompt';
import Logo from './Logo';
import { supabase } from '../supabase';

interface CanalLoja {
  nome_rede: string;
  endereco: string;
}

const MENU_LINKS = [
  { href: '/', label: 'Loja', icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9 21v-6h6v6' },
  { href: '/pedidos', label: 'Pedidos', icon: 'M7 4h10l2 4v13H5V8l2-4ZM5 8h14M9 12h6M9 16h6' },
  { href: '/dieta', label: 'Dieta', icon: 'M8 3v18M16 3v18M4 8h16M4 16h16' },
  { href: '/meu-treino', label: 'Treino', icon: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12' },
  { href: '/perfil', label: 'Perfil', icon: 'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z' },
];

function CanalIcone({ nome }: { nome: string }) {
  const rede = nome.toLowerCase();

  if (rede.includes('instagram')) {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5.2" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  if (rede.includes('whatsapp')) {
    return (
      <svg className="h-5 w-5" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true">
        <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32 101.3 32 1.6 131.7 1.6 254.3c0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.6 0 222.3-99.7 222.3-222.3 0-59.3-23.1-115-65.3-156.7zM223.9 438.7h-.1c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3 18.6-68.1-4.4-7c-18.5-29.4-28.2-63.3-28.2-98 0-101.3 82.4-183.7 183.8-183.7 49.1 0 95.2 19.1 129.9 53.8 34.7 34.7 53.8 80.9 53.7 130 0 101.4-82.4 183.8-183.8 183.8zm100.8-137.7c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.5-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.5-19.4 19-19.4 46.3s19.9 53.7 22.6 57.4c2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
      </svg>
    );
  }

  return <span className="text-xs font-black">VL</span>;
}

function DesktopMenu({ canais }: { canais: CanalLoja[] }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        className="fixed right-5 top-5 z-50 hidden h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-viva-roxo shadow-lg transition hover:scale-105 hover:border-viva-verde md:flex"
      >
        <span className="flex flex-col gap-1.5">
          <span className="block h-0.5 w-5 rounded-full bg-current" />
          <span className="block h-0.5 w-5 rounded-full bg-current" />
          <span className="block h-0.5 w-5 rounded-full bg-current" />
          <span className="block h-0.5 w-5 rounded-full bg-current" />
        </span>
      </button>

      {aberto && (
        <div className="fixed inset-0 z-[80] hidden md:block">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-gray-950/30 backdrop-blur-sm"
            onClick={() => setAberto(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="w-44">
                <Logo />
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl font-light text-gray-500 transition hover:bg-gray-200"
              >
                x
              </button>
            </div>

            <nav className="mt-8 space-y-2">
              {MENU_LINKS.map(link => {
                const ativo = pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black transition ${
                      ativo ? 'bg-viva-roxo text-white shadow-sm' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                    </svg>
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-8 rounded-2xl border border-viva-verde/30 bg-viva-verde/10 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-viva-roxo">Contatos</p>
              <div className="mt-3 flex gap-3">
                {canais
                  .filter(canal => /instagram|whatsapp/i.test(canal.nome_rede))
                  .map(canal => (
                    <a
                      key={canal.nome_rede}
                      href={canal.endereco}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex h-11 w-11 items-center justify-center rounded-full text-white shadow-sm transition hover:scale-105 ${
                        canal.nome_rede.toLowerCase().includes('whatsapp')
                          ? 'bg-[#25D366]'
                          : 'bg-gradient-to-br from-fuchsia-500 via-viva-roxo to-orange-400'
                      }`}
                      aria-label={canal.nome_rede}
                    >
                      <CanalIcone nome={canal.nome_rede} />
                    </a>
                  ))}
              </div>
            </div>

            <div className="mt-auto rounded-2xl bg-gray-50 p-4 text-xs font-semibold leading-relaxed text-gray-500">
              Viva Leve DF: cardapio, pedidos e acompanhamento de dieta em um so lugar.
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const [canais, setCanais] = useState<CanalLoja[]>([]);

  useEffect(() => {
    if (isAdmin) return;

    supabase
      .from('canais_loja')
      .select('nome_rede,endereco')
      .eq('ativo', true)
      .then(({ data }) => setCanais((data ?? []) as CanalLoja[]));
  }, [isAdmin]);

  if (isAdmin) {
    return (
      <div className="h-[100dvh] min-h-screen w-full overflow-y-auto bg-gray-100">
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto h-[100dvh] min-h-screen w-full overflow-y-auto bg-white shadow-none md:max-w-6xl md:shadow-2xl">
      <DesktopMenu canais={canais} />
      {children}
      <AppDownloadPrompt />
    </div>
  );
}
