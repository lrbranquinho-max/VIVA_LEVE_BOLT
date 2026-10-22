'use client';

import { useEffect } from 'react';
import { registrarPurchaseConfirmado } from '@/lib/storeAnalytics';

export default function PurchaseConfirmationTracker({ pedidoId }: { pedidoId?: string | null }) {
  useEffect(() => { if (pedidoId) void registrarPurchaseConfirmado(pedidoId); }, [pedidoId]);
  return null;
}
