'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hasMetaConsentChoice, pixelConfigured, setMetaConsent } from '@/lib/storeAnalytics';

export default function MetaConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(!pathname?.startsWith('/admin') && pixelConfigured() && !hasMetaConsentChoice()), [pathname]);
  if (!visible) return null;
  const choose = (accepted: boolean) => { setMetaConsent(accepted); setVisible(false); };
  return <aside className="fixed inset-x-3 bottom-3 z-[200] mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl" aria-label="Preferências de privacidade">
    <p className="text-sm font-bold text-gray-900">Privacidade e mensuração</p>
    <p className="mt-1 text-xs leading-relaxed text-gray-600">Com sua autorização, usamos a Meta para medir campanhas. A loja e o pagamento continuam funcionando se você recusar. <Link href="/politica-de-privacidade" className="underline">Saiba mais</Link>.</p>
    <div className="mt-3 flex gap-2"><button type="button" onClick={() => choose(false)} className="flex-1 rounded-xl border px-3 py-2 text-xs font-black">Recusar</button><button type="button" onClick={() => choose(true)} className="flex-1 rounded-xl bg-viva-roxo px-3 py-2 text-xs font-black text-white">Aceitar</button></div>
  </aside>;
}
