"use client";

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

const MENSAGEM_WHATSAPP = 'Olá! Vi no aplicativo da Viva Leve a proposta do plano mensal de marmitas e tenho interesse em conhecer mais sobre o pagamento por voucher.';

interface Slide {
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  href: string;
  external?: boolean;
  className: string;
}

function criarLinkWhatsApp(endereco?: string) {
  const fallback = 'https://wa.me/556191299996';
  const base = endereco?.trim() || fallback;

  try {
    const url = new URL(base);
    url.searchParams.set('text', MENSAGEM_WHATSAPP);
    return url.toString();
  } catch {
    return `${fallback}?text=${encodeURIComponent(MENSAGEM_WHATSAPP)}`;
  }
}

export default function StorePromotionalCarousel({ whatsappUrl }: { whatsappUrl?: string }) {
  const trilhoRef = useRef<HTMLDivElement>(null);
  const [slideAtivo, setSlideAtivo] = useState(0);
  const [pausado, setPausado] = useState(false);

  const slides: Slide[] = [
    {
      eyebrow: 'SUA DIETA COM IA',
      title: 'Plano nutricional gratuito e personalizado',
      description: 'Use a inteligência artificial para apoiar seus objetivos.',
      action: 'Criar Plano Nutricional',
      href: '/dieta',
      className: 'bg-viva-roxo text-white',
    },
    {
      eyebrow: 'TREINO INTELIGENTE',
      title: 'Seu treino com IA em um só lugar',
      description: 'Acompanhe sua planilha personalizada e vídeos instrutivos.',
      action: 'Conhecer área de Treino',
      href: '/meu-treino',
      className: 'bg-viva-verde text-viva-roxo',
    },
    {
      eyebrow: 'PLANO MENSAL',
      title: 'Marmitas com pagamento por voucher',
      description: 'Conheça as opções para vale alimentação ou refeição.',
      action: 'Falar com a Viva Leve',
      href: criarLinkWhatsApp(whatsappUrl),
      external: true,
      className: 'bg-gray-900 text-white',
    },
  ];

  const irParaSlide = useCallback((indice: number) => {
    const proximo = (indice + slides.length) % slides.length;
    const trilho = trilhoRef.current;
    if (!trilho) return;

    trilho.scrollTo({ left: trilho.clientWidth * proximo, behavior: 'smooth' });
    setSlideAtivo(proximo);
  }, [slides.length]);

  useEffect(() => {
    if (pausado || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const intervalo = window.setInterval(() => irParaSlide(slideAtivo + 1), 8000);
    return () => window.clearInterval(intervalo);
  }, [irParaSlide, pausado, slideAtivo]);

  const atualizarSlideVisivel = () => {
    const trilho = trilhoRef.current;
    if (!trilho || trilho.clientWidth === 0) return;
    setSlideAtivo(Math.round(trilho.scrollLeft / trilho.clientWidth));
  };

  return (
    <section
      aria-label="Destaques Viva Leve"
      aria-roledescription="carrossel"
      className="overflow-hidden rounded-2xl bg-white shadow-sm"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocusCapture={() => setPausado(true)}
      onBlurCapture={() => setPausado(false)}
    >
      <div
        ref={trilhoRef}
        onScroll={atualizarSlideVisivel}
        className="flex snap-x snap-mandatory overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {slides.map(slide => {
          const conteudo = (
            <div className="flex min-h-[148px] flex-col justify-between p-4">
              <div>
                <p className={`text-[10px] font-black uppercase tracking-wider ${slide.className.includes('bg-viva-verde') ? 'text-viva-roxo/70' : 'text-viva-verde'}`}>
                  {slide.eyebrow}
                </p>
                <h2 className="mt-1 text-base font-black leading-tight">{slide.title}</h2>
                <p className={`mt-1.5 max-w-xl text-xs font-semibold leading-relaxed ${slide.className.includes('bg-viva-verde') ? 'text-viva-roxo/80' : 'text-white/75'}`}>
                  {slide.description}
                </p>
              </div>
              <span className="mt-3 inline-flex w-fit rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-black ring-1 ring-white/25">
                {slide.action}
              </span>
            </div>
          );

          return (
            <article key={slide.eyebrow} className={`w-full shrink-0 snap-start ${slide.className}`}>
              {slide.external ? (
                <a href={slide.href} target="_blank" rel="noreferrer" className="block">
                  {conteudo}
                </a>
              ) : (
                <Link href={slide.href} className="block">
                  {conteudo}
                </Link>
              )}
            </article>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2 bg-white py-2" aria-label="Selecionar destaque">
        {slides.map((slide, indice) => (
          <button
            key={slide.eyebrow}
            type="button"
            onClick={() => irParaSlide(indice)}
            aria-label={`Exibir destaque ${indice + 1}: ${slide.eyebrow}`}
            aria-current={indice === slideAtivo}
            className={`h-2 rounded-full transition-all ${indice === slideAtivo ? 'w-6 bg-viva-roxo' : 'w-2 bg-gray-300'}`}
          />
        ))}
      </div>
    </section>
  );
}
