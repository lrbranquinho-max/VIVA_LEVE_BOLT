'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'viva-leve-sessao-loja';

export default function LojaAccessTracker() {
  useEffect(() => {
    try {
      let sessaoId = sessionStorage.getItem(STORAGE_KEY);
      if (!sessaoId) {
        sessaoId = crypto.randomUUID();
        sessionStorage.setItem(STORAGE_KEY, sessaoId);
      }
      void fetch('/api/analytics/loja-acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessaoId }),
        keepalive: true,
      });
    } catch {
      // Telemetria não deve bloquear a experiência da loja.
    }
  }, []);

  return null;
}
