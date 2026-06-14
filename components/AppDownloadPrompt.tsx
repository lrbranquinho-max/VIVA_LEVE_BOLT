"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=br.com.vivalevedf.app';
const STORAGE_KEY = 'viva-leve-app-download-dismissed';
const ROTAS_OCULTAS = ['/admin', '/login', '/cardapio'];

function isMobileBrowser() {
  if (typeof window === 'undefined') return false;

  const userAgent = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(userAgent);
  const isNativeCapacitor = Boolean((window as any).Capacitor?.isNativePlatform?.());
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

  return isMobile && !isNativeCapacitor && !isStandalone;
}

export default function AppDownloadPrompt() {
  const pathname = usePathname();
  const [visivel, setVisivel] = useState(false);
  const ocultarRota = ROTAS_OCULTAS.some(rota => pathname === rota || pathname.startsWith(`${rota}/`));

  useEffect(() => {
    if (ocultarRota) {
      setVisivel(false);
      return;
    }

    const dispensado = localStorage.getItem(STORAGE_KEY) === 'true';
    setVisivel(isMobileBrowser() && !dispensado);
  }, [ocultarRota, pathname]);

  if (!visivel) return null;

  const dispensar = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisivel(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 mx-auto max-w-md rounded-2xl border border-viva-verde/50 bg-white p-4 text-gray-800 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-viva-roxo text-lg font-black text-viva-verde">
          VL
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-viva-roxo">Instale o app VivaLeve DF</p>
          <p className="mt-1 text-xs font-semibold text-gray-500">Acesse pedidos, dieta e cardápio com mais praticidade.</p>
          <div className="mt-3 flex gap-2">
            <a
              href={PLAY_STORE_URL}
              className="rounded-xl bg-viva-roxo px-4 py-2 text-xs font-black text-white shadow-sm"
            >
              Baixar app
            </a>
            <button
              type="button"
              onClick={dispensar}
              className="rounded-xl bg-gray-100 px-4 py-2 text-xs font-black text-gray-600"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
