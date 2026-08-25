'use client';

import { formatarMoeda } from '@/lib/financeiro';

export interface SerieFinanceira {
  rotulo: string;
  receitas: number;
  saidas: number;
}

export interface FatiaFinanceira {
  rotulo: string;
  valor: number;
}

function BarraComparativa({ item, maximo }: { item: SerieFinanceira; maximo: number }) {
  const receita = maximo ? Math.max(2, (item.receitas / maximo) * 100) : 0;
  const saida = maximo ? Math.max(2, (item.saidas / maximo) * 100) : 0;

  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs">
      <span className="truncate font-bold text-gray-500">{item.rotulo}</span>
      <div className="space-y-1">
        <div className="h-2 overflow-hidden bg-gray-100" title={`Receitas: ${formatarMoeda(item.receitas)}`}>
          <div className="h-full bg-emerald-500" style={{ width: `${receita}%` }} />
        </div>
        <div className="h-2 overflow-hidden bg-gray-100" title={`Saídas: ${formatarMoeda(item.saidas)}`}>
          <div className="h-full bg-viva-roxo" style={{ width: `${saida}%` }} />
        </div>
      </div>
    </div>
  );
}

export function GraficoReceitasSaidas({ titulo, dados }: { titulo: string; dados: SerieFinanceira[] }) {
  const maximo = Math.max(0, ...dados.flatMap(item => [item.receitas, item.saidas]));

  return (
    <section className="border-y border-gray-200 bg-white px-4 py-5 md:border md:px-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-black text-gray-900">{titulo}</h2>
        <div className="flex gap-3 text-xs font-bold text-gray-500">
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 bg-emerald-500" />Receitas</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 bg-viva-roxo" />Saídas</span>
        </div>
      </div>
      {dados.length ? (
        <div className="space-y-3">{dados.map(item => <BarraComparativa key={item.rotulo} item={item} maximo={maximo} />)}</div>
      ) : <p className="py-8 text-center text-sm text-gray-400">Sem movimentações no período.</p>}
    </section>
  );
}

export function GraficoDistribuicao({ titulo, dados }: { titulo: string; dados: FatiaFinanceira[] }) {
  const maximo = Math.max(0, ...dados.map(item => item.valor));
  const total = dados.reduce((soma, item) => soma + item.valor, 0);

  return (
    <section className="border-y border-gray-200 bg-white px-4 py-5 md:border md:px-5">
      <h2 className="mb-4 text-base font-black text-gray-900">{titulo}</h2>
      {dados.length ? (
        <div className="space-y-3">
          {dados.map(item => (
            <div key={item.rotulo}>
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span className="truncate font-bold text-gray-600">{item.rotulo}</span>
                <span className="shrink-0 font-black text-gray-800">{formatarMoeda(item.valor)} · {total ? Math.round((item.valor / total) * 100) : 0}%</span>
              </div>
              <div className="h-2 overflow-hidden bg-gray-100">
                <div className="h-full bg-viva-verde" style={{ width: `${maximo ? Math.max(3, item.valor / maximo * 100) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : <p className="py-8 text-center text-sm text-gray-400">Sem saídas pagas no período.</p>}
    </section>
  );
}
