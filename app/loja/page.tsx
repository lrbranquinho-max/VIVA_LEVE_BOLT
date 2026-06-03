"use client";

import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';

export default function LojaCliente() {
  const [produtos, setProdutos] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function buscarCardapio() {
      // Puxa apenas os produtos que estão com estoque maior que zero e ativos
      const { data, error } = await supabase
        .from('produtos')
        .select('*')
        .gt('estoque', 0)
        .order('categoria', { ascending: true });

      if (data) {
        setProdutos(data);
      }
      setCarregando(false);
    }
    buscarCardapio();
  }, []);

  return (
    // max-w-md centraliza a tela no computador imitando a largura de um celular
    <div className="min-h-screen bg-gray-50 font-sans max-w-md mx-auto shadow-2xl relative pb-20">
      
      {/* Cabeçalho do App */}
      <header className="bg-viva-roxo text-white p-5 rounded-b-3xl shadow-md">
        <h1 className="text-2xl font-extrabold text-viva-verde tracking-tight text-center">
          VIVA LEVE
        </h1>
        <p className="text-center text-sm mt-1 text-gray-200">Saúde e praticidade no seu dia</p>
        
        {/* Barra de Busca Simples */}
        <div className="mt-4">
          <input 
            type="text" 
            placeholder="Buscar marmita, whey, lanche..." 
            className="w-full py-2 px-4 rounded-full text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-viva-verde shadow-inner"
          />
        </div>
      </header>

      {/* Categorias (Navegação Rápida) */}
      <div className="flex overflow-x-auto gap-3 p-4 scrollbar-hide">
        <button className="bg-viva-verde text-viva-roxo px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap shadow-sm">Todos</button>
        <button className="bg-white text-gray-600 px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap border border-gray-200 shadow-sm">Marmitas</button>
        <button className="bg-white text-gray-600 px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap border border-gray-200 shadow-sm">Lanches</button>
        <button className="bg-white text-gray-600 px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap border border-gray-200 shadow-sm">Suplementos</button>
      </div>

      {/* Lista de Produtos */}
      <main className="p-4 space-y-4">
        <h2 className="font-bold text-gray-800 text-lg mb-2">Nosso Cardápio</h2>
        
        {carregando ? (
          <p className="text-center text-gray-500 animate-pulse mt-10">Carregando cardápio saudável...</p>
        ) : (
          produtos.map((item) => (
            <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex gap-4">
              {/* Espaço para a foto da marmita */}
              <div className="w-24 h-24 bg-gray-200 rounded-xl flex-shrink-0 flex items-center justify-center text-gray-400 text-xs">
                Sem Foto
              </div>
              
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-gray-800 text-sm leading-tight">{item.nome}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.descricao}</p>
                </div>
                
                <div className="flex justify-between items-end mt-2">
                  <p className="font-extrabold text-viva-roxo">R$ {item.preco.toFixed(2)}</p>
                  <button className="bg-viva-verde text-viva-roxo font-bold w-8 h-8 rounded-full flex items-center justify-center shadow-md hover:scale-105 transition-transform">
                    +
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </main>

      {/* Menu Fixo no Rodapé (Bottom Navigation) */}
      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 flex justify-around p-3 pb-5">
        <button className="flex flex-col items-center text-viva-roxo">
          <span className="text-xl">🏠</span>
          <span className="text-[10px] font-bold mt-1">Loja</span>
        </button>
        <button className="flex flex-col items-center text-gray-400">
          <span className="text-xl">🛒</span>
          <span className="text-[10px] font-bold mt-1">Carrinho</span>
        </button>
        <button className="flex flex-col items-center text-gray-400">
          <span className="text-xl">📱</span>
          <span className="text-[10px] font-bold mt-1">Sua Dieta</span>
        </button>
      </nav>

    </div>
  );
}