'use client';

import { useEffect, useState } from 'react';
import { useCompanySettings } from '@/components/CompanySettingsProvider';
import { supabase } from '../../supabase';

export default function PainelAdmin() {
  const company = useCompanySettings();
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [erroBanco, setErroBanco] = useState<string | null>(null);

  useEffect(() => {
    async function carregarDados() {
      try {
        const { count, error } = await supabase.from('produtos').select('id', { count: 'exact', head: true });
        if (error) setErroBanco(error.message);
        else if (count !== null) { setTotalProdutos(count); setErroBanco(null); }
      } catch (error: any) {
        setErroBanco(error.message || 'Erro desconhecido na conexão.');
      }
    }
    void carregarDados();
  }, []);

  return <div className="flex min-h-screen bg-viva-fundo font-sans">
    <aside className="hidden w-64 bg-viva-roxo p-6 text-white md:block">
      <h1 className="mb-10 text-3xl font-extrabold tracking-tighter text-viva-verde">{company.nome_fantasia.toUpperCase()}</h1>
      <nav className="space-y-3">
        <a href="#" className="block rounded bg-white/10 px-4 py-2.5 font-semibold">Dashboard</a>
        <a href="#" className="block rounded px-4 py-2.5 text-gray-300 transition hover:bg-white/10">Pedidos</a>
        <a href="#" className="block rounded px-4 py-2.5 text-gray-300 transition hover:bg-white/10">Estoque / Cardápio</a>
      </nav>
    </aside>
    <main className="flex-1 p-8">
      <header className="mb-10 flex items-center justify-between">
        <div><h2 className="text-3xl font-bold text-viva-roxo">Visão Geral</h2><p className="mt-1 text-gray-500">Acompanhe a operação de hoje.</p></div>
        <button className="rounded-lg bg-viva-verde px-6 py-3 font-bold text-viva-roxo shadow-md transition hover:brightness-105">+ Novo Pedido Manual</button>
      </header>
      {erroBanco && <div className="mb-6 rounded border-l-4 border-red-500 bg-red-100 p-4 text-red-700 shadow-sm"><p className="font-bold">Aviso do Banco de Dados:</p><p className="text-sm">{erroBanco}</p><p className="mt-1 text-xs text-gray-500">Verifique as configurações do ambiente e as políticas de acesso ao banco.</p></div>}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"><h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Faturamento do Dia</h3><p className="mt-3 text-3xl font-bold text-viva-roxo">R$ 0,00</p></div>
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"><h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Itens no Cardápio</h3><p className="mt-3 text-3xl font-bold text-viva-roxo">{totalProdutos}</p></div>
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"><h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Estoque Crítico</h3><p className="mt-3 text-3xl font-bold text-red-500">0 Itens</p></div>
      </div>
    </main>
  </div>;
}
