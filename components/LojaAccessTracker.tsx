'use client';

import { useEffect } from 'react';
import { registrarEventoLoja } from '@/lib/storeAnalytics';

export default function LojaAccessTracker() {
  useEffect(() => {
    void registrarEventoLoja('store_visit', {}, { dedupeKey: 'store-visit' });
    const consentChanged = () => { void registrarEventoLoja('store_visit', {}, { dedupeKey: 'store-visit-after-consent' }); };
    window.addEventListener('viva-leve-meta-consent-changed', consentChanged);
    return () => window.removeEventListener('viva-leve-meta-consent-changed', consentChanged);
  }, []);

  return null;
}
