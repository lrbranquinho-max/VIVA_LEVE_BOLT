"use client";

import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';

export default function PainelAdmin() {
  const [totalProdutos, setTotalProdutos] = useState(0);
  const [erroBanco, setErroBanco] = useState<string | null>(null);

  useEffect(() => {
    async function carregarDados() {
      try {
        const { count, error } = await supabase
          .from('produtos')
          .select('*', { count: 'exact', head: true });

        if (error) {
          setErroBanco(error.message);
        } else if (count !== null) {
          setTotalProdutos(count);
          setErroBanco(null);
        }
      } catch (err: any) {
        setErroBanco(err.message || "Erro desconhecido na conexão.");
      }
    }
    carregarDados();
  }, []); // O array vazio garante que o código só rode UMA vez ao carregar a página

  return (
    <div className="min-h-screen bg-viva-fundo flex font-sans">
      
      {/* Menu Lateral */}
      <aside className="w-64 bg-viva-roxo text-white p-6 hidden md:block">
        <h1 className="text-3xl font-extrabold text-viva-verde mb-10 tracking-tighter">
          VIVA LEVE
        </h1>
        <nav className="space-y-3">
          <a href="#" className="block py-2.5 px-4 bg-white/10 rounded font-semibold">Dashboard</a>
          <a href="#" className="block py-2.5 px-4 hover:bg-white/10 rounded transition text-gray-300">Pedidos</a>
          <a href="#" className="block py-2.5 px-4 hover:bg-white/10 rounded transition text-gray-300">Estoque / Cardápio</a>
        </nav>
      </aside>

      {/* Área Principal */}
      <main className="flex-1 p-8">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold text-viva-roxo">Visão Geral</h2>
            <p className="text-gray-500 mt-1">Acompanhe a operação de hoje no DF e Entorno.</p>
          </div>
          <button className="bg-viva-verde text-viva-roxo font-bold py-3 px-6 rounded-lg shadow-md hover:brightness-105 transition">
            + Novo Pedido Manual
          </button>
        </header>

        {/* Alerta Visual de Erro se houver bloqueio */}
        {erroBanco && (
          <div className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded shadow-sm">
            <p className="font-bold">Aviso do Banco de Dados:</p>
            <p className="text-sm">{erroBanco}</p>
            <p className="text-xs mt-1 text-gray-500">Dica: Verifique se as chaves no arquivo .env.local foram coladas corretamente e se o RLS está desativado.</p>
          </div>
        )}

        {/* Cards de Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Faturamento do Dia</h3>
            <p className="text-3xl font-bold text-viva-roxo mt-3">R$ 0,00</p>
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Itens no Cardápio</h3>
            <p className="text-3xl font-bold text-viva-roxo mt-3">{totalProdutos}</p>
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Estoque Crítico</h3>
            <p className="text-3xl font-bold text-red-500 mt-3">0 Itens</p>
          </div>
        </div>
      </main>

    </div>
  );
}