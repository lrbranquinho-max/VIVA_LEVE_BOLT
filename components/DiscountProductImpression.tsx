'use client';

import { useEffect, useRef } from 'react';
import { discountAnalyticsProperties, StoreDiscountBenefit } from '@/lib/storeDiscounts';
import { registrarEventoLoja } from '@/lib/storeAnalytics';

export default function DiscountProductImpression({ product, benefit }: {
  product: { id: number; nome: string; preco: number };
  benefit: StoreDiscountBenefit | null;
}) {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!benefit || !marker.current) return;
    const element = marker.current;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      void registrarEventoLoja('product_impression', {
        value: discountAnalyticsProperties(product.preco, benefit).final_price,
        currency: 'BRL', content_ids: [product.id], content_name: product.nome, content_type: 'product',
        ...discountAnalyticsProperties(product.preco, benefit),
      }, { produtoId: product.id, dedupeKey: `discount-impression-${product.id}-${benefit.source}-${benefit.percent}` });
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [benefit, product.id, product.nome, product.preco]);

  return <span ref={marker} aria-hidden="true" className="absolute left-0 top-0 h-full w-px pointer-events-none" />;
}
