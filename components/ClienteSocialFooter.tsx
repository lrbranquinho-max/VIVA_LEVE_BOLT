"use client";

import { Camera, MessageCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';

const INSTAGRAM_URL = 'https://instagram.com/';
const WHATSAPP_NUMERO = '55XXXXXXXXXXX';
const WHATSAPP_MENSAGEM = 'Olá! Gostaria de tirar uma dúvida sobre o cardápio da Viva Leve.';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(WHATSAPP_MENSAGEM)}`;

const ROTAS_OCULTAS = ['/admin', '/login', '/cardapio'];

export default function ClienteSocialFooter() {
  const pathname = usePathname();
  const ocultar = ROTAS_OCULTAS.some(rota => pathname === rota || pathname.startsWith(`${rota}/`));

  if (ocultar) return null;

  return (
    <>
      <footer className="pointer-events-none fixed bottom-[5.6rem] left-1/2 z-20 w-full max-w-md -translate-x-1/2 px-4">
        <div className="pointer-events-auto flex w-max items-center gap-2 rounded-full border border-gray-100 bg-white/95 px-3 py-2 text-viva-roxo shadow-lg backdrop-blur">
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Instagram Viva Leve"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-50 transition hover:bg-viva-roxo hover:text-white"
          >
            <Camera className="h-4 w-4" strokeWidth={2.5} />
          </a>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="WhatsApp Viva Leve"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 transition hover:bg-viva-verde hover:text-viva-roxo"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={2.5} />
          </a>
        </div>
      </footer>

      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Abrir suporte pelo WhatsApp"
        className="fixed bottom-[5.7rem] right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-viva-verde text-viva-roxo shadow-xl ring-1 ring-black/5 transition hover:scale-105 hover:brightness-105"
      >
        <MessageCircle className="h-5 w-5" strokeWidth={2.8} />
      </a>
    </>
  );
}
