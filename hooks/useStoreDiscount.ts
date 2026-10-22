'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/supabase';
import { bestStoreCoupon, resolveStoreDiscount, StoreCoupon, StoreDiscountBenefit } from '@/lib/storeDiscounts';

export function useStoreDiscount() {
  const [benefit, setBenefit] = useState<StoreDiscountBenefit | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [configResponse, userResponse] = await Promise.all([
          supabase.from('app_config').select('valor').eq('chave', 'loja_config').maybeSingle(),
          supabase.auth.getUser(),
        ]);
        if (configResponse.error) throw configResponse.error;
        const rawConfig = (configResponse.data?.valor ?? {}) as Record<string, unknown>;
        let coupon: StoreCoupon | null = null;
        const user = userResponse.data.user;
        if (user) {
          const couponsResponse = await supabase.from('cupons_desconto')
            .select('id, percentual_desconto, data_validade')
            .eq('cliente_id', user.id).eq('status', 'aberto')
            .gte('data_validade', new Date().toISOString());
          if (couponsResponse.error) throw couponsResponse.error;
          coupon = bestStoreCoupon((couponsResponse.data ?? []) as StoreCoupon[]);
        }
        if (active) setBenefit(resolveStoreDiscount(coupon, {
          cupom_dia_d_ativo: Boolean(rawConfig.cupom_dia_d_ativo),
          cupom_dia_d_percentual: Number(rawConfig.cupom_dia_d_percentual ?? 0),
        }));
      } catch {
        // Falha de consulta nunca deve anunciar um desconto que o checkout não consiga validar.
        if (active) setBenefit(null);
      } finally {
        if (active) setLoaded(true);
      }
    }

    void load();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => { setLoaded(false); void load(); });
    return () => { active = false; authListener.subscription.unsubscribe(); };
  }, []);

  return { benefit, loaded };
}
