"use client";

import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '../../components/Logo';

interface ItemPedido {
  id: number;
  nome: string;
  preco: number;
  quantidade: number;
  subtotal: number;
}

interface Pedido {
  id: string;
  endereco_entrega: string;
  valor_total: number;
  status: string;
  itens: ItemPedido[];
  created_at: string;
}

const ETAPAS_STATUS = [
  { key: 'Pendente', label: 'Pedido Recebido', icon: '📋' },
  { key: 'Em Preparo', label: 'Em Preparo', icon: '👨‍🍳' },
  { key: 'Em Rota', label: 'Saiu para Entrega', icon: '🛵' },
  { key: 'Concluído', label: 'Entregue', icon: '✅' },
];

function getStatusIndex(status: string): number {
  const idx = ETAPAS_STATUS.findIndex(e => e.key === status);
  return idx === -1 ? 0 : idx;
}

function badgeStatus(status: string) {
  const cores: Record<string, string> = {
    'Pendente': 'bg-gray-100 text-gray-600',
    'Em Preparo': 'bg-yellow-100 text-yellow-700',
    'Em Rota': 'bg-blue-100 text-blue-700',
    'Concluído': 'bg-green-100 text-green-700',
    'Cancelado': 'bg-red-100 text-red-700',
  };
  return cores[status] ?? 'bg-gray-100 text-gray-600';
}

function LinhaDoTempo({ status }: { status: string }) {
  if (status === 'Cancelado') {
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="text-red-500 text-lg">✕</span>
        <span className="text-sm font-semibold text-red-500">Pedido Cancelado</span>
      </div>
    );
  }

  const indiceAtual = getStatusIndex(status);

  return (
    <div className="flex items-start gap-0 w-full mt-3">
      {ETAPAS_STATUS.map((etapa, idx) => {
        const concluida = idx < indiceAtual;
        const ativa = idx === indiceAtual;
        const ultima = idx === ETAPAS_STATUS.length - 1;

        return (
          <div key={etapa.key} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              {idx > 0 && (
                <div className={`h-1 flex-1 transition-all duration-500 ${concluida || ativa ? 'bg-viva-roxo' : 'bg-gray-200'}`} />
              )}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all duration-500 border-2 ${
                concluida ? 'bg-viva-roxo border-viva-roxo text-white' :
                ativa ? 'bg-white border-viva-roxo text-viva-roxo' :
                'bg-gray-100 border-gray-300 text-gray-400'
              }`}>
                {concluida ? '✓' : ''}
              </div>
              {!ultima && (
                <div className={`h-1 flex-1 transition-all duration-500 ${concluida ? 'bg-viva-roxo' : 'bg-gray-200'}`} />
              )}
            </div>
            <p className={`text-[10px] font-semibold mt-1.5 text-center leading-tight ${
              ativa ? 'text-viva-roxo' : concluida ? 'text-gray-600' : 'text-gray-400'
            }`}>
              {etapa.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function MeusPedidos() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data, error } = await supabase
        .from('pedidos')
        .select('*')
        .eq('cliente_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) setPedidos(data);
      setLoading(false);
    }
    init();
  }, [router]);

  const formatarData = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 animate-pulse">Carregando seus pedidos...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans max-w-md mx-auto shadow-2xl relative pb-24">

      <header className="bg-white border-b border-gray-100 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-viva-roxo p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1">
            <Logo />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-800 mt-3">Meus Pedidos</h1>
      </header>

      <main className="p-4 space-y-4">

        {pedidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="text-6xl">📋</div>
            <p className="text-gray-500 font-semibold text-center">Você ainda não fez nenhum pedido.</p>
            <Link
              href="/"
              className="bg-viva-roxo text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:brightness-110 transition-all"
            >
              Ver Cardápio
            </Link>
          </div>
        ) : (
          pedidos.map(pedido => {
            const aberto = pedidoAberto === pedido.id;
            const isCancelado = pedido.status === 'Cancelado';

            return (
              <div
                key={pedido.id}
                className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${
                  isCancelado ? 'border-red-100 opacity-75' : 'border-gray-100'
                }`}
              >
                <button
                  onClick={() => setPedidoAberto(aberto ? null : pedido.id)}
                  className="w-full text-left p-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">{formatarData(pedido.created_at)}</p>
                      <p className="text-sm text-gray-600 mt-0.5 truncate max-w-[180px]">
                        #{pedido.id.toString().slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${badgeStatus(pedido.status)}`}>
                        {pedido.status}
                      </span>
                      <span className="text-base font-extrabold text-viva-roxo">
                        R$ {Number(pedido.valor_total).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {!isCancelado && <LinhaDoTempo status={pedido.status} />}
                  {isCancelado && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-red-400 text-sm">✕</span>
                      <span className="text-xs font-semibold text-red-400">Pedido Cancelado</span>
                    </div>
                  )}

                  <div className="flex justify-end mt-2">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      {aberto ? 'Fechar detalhes ▲' : 'Ver detalhes ▼'}
                    </span>
                  </div>
                </button>

                {aberto && (
                  <div className="border-t border-gray-100 p-4 space-y-3 bg-gray-50">
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Endereço de Entrega</p>
                      <p className="text-sm text-gray-700">{pedido.endereco_entrega}</p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Itens do Pedido</p>
                      <div className="space-y-1.5">
                        {(pedido.itens ?? []).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-gray-700">{item.quantidade}x {item.nome}</span>
                            <span className="font-semibold text-gray-800">R$ {(item.preco * item.quantidade).toFixed(2)}</span>
                          </div>
                        ))}
                        <div className="border-t border-gray-200 pt-1.5 flex justify-between font-bold text-sm">
                          <span className="text-gray-700">Total</span>
                          <span className="text-viva-roxo">R$ {Number(pedido.valor_total).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {!isCancelado && pedido.status !== 'Concluído' && (
                      <div className="bg-viva-verde/20 rounded-xl p-3">
                        <p className="text-xs font-semibold text-viva-roxo text-center">
                          Atualizamos o status em tempo real. Qualquer dúvida, entre em contato via WhatsApp.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>

      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 flex justify-around p-3 pb-5 z-10">
        <Link href="/" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo">
          <span className="text-xl">&#127968;</span>
          <span className="text-[10px] font-bold mt-1">Loja</span>
        </Link>
        <button className="flex flex-col items-center text-viva-roxo">
          <span className="text-xl">&#128203;</span>
          <span className="text-[10px] font-bold mt-1">Pedidos</span>
        </button>
        <Link href="/dieta" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo">
          <span className="text-xl">&#128241;</span>
          <span className="text-[10px] font-bold mt-1">Dieta</span>
        </Link>
        <Link href="/perfil" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo">
          <span className="text-xl">&#128100;</span>
          <span className="text-[10px] font-bold mt-1">Perfil</span>
        </Link>
      </nav>

    </div>
  );
}
