"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase';
import Link from 'next/link';

const WHATSAPP_DONO = '5561999999999';

interface Produto {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  categoria: string;
  estoque: number;
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  imagem_url?: string;
  ativo: boolean;
}

interface Toast {
  id: number;
  texto: string;
  tipo: 'sucesso' | 'erro' | 'info';
}

let toastId = 0;

export default function LojaCliente() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [carrinho, setCarrinho] = useState<{ [key: number]: number }>({});
  const [verCarrinho, setVerCarrinho] = useState(false);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const adicionarToast = useCallback((texto: string, tipo: Toast['tipo'] = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, texto, tipo }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    async function init() {
      setCarregando(true);
      setErroCarga(null);

      try {
        const { data: produtosData, error: errProdutos } = await supabase
          .from('produtos')
          .select('*')
          .order('categoria', { ascending: true });

        if (errProdutos) throw new Error(errProdutos.message);
        setProdutos(produtosData ?? []);
      } catch (err: any) {
        console.error('[Loja] Erro ao carregar produtos:', err);
        setErroCarga(err.message);
      } finally {
        setCarregando(false);
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: perfil } = await supabase
            .from('perfis')
            .select('nome, telefone')
            .eq('id', user.id)
            .maybeSingle();

          if (perfil) {
            setNome(perfil.nome ?? '');
            setTelefone(perfil.telefone ?? '');
          }

          const { data: perfilCliente } = await supabase
            .from('perfis_clientes')
            .select('endereco_rua, endereco_numero, bairro, regiao_df')
            .eq('id', user.id)
            .maybeSingle();

          if (perfilCliente) {
            const parts = [
              perfilCliente.endereco_rua,
              perfilCliente.endereco_numero,
              perfilCliente.bairro,
              perfilCliente.regiao_df,
            ].filter(Boolean);
            setEndereco(parts.join(', '));
          }
        }
      } catch (err: any) {
        console.error('[Loja] Erro ao carregar perfil:', err);
      }
    }
    init();
  }, []);

  const adicionarAoCarrinho = (id: number) => {
    setCarrinho(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    const produto = produtos.find(p => p.id === id);
    if (produto) adicionarToast(`${produto.nome} adicionado!`, 'sucesso');
  };

  const removerDoCarrinho = (id: number) => {
    setCarrinho(prev => {
      const atual = prev[id] || 0;
      if (atual <= 1) {
        const copia = { ...prev };
        delete copia[id];
        return copia;
      }
      return { ...prev, [id]: atual - 1 };
    });
  };

  const totalItens = Object.values(carrinho).reduce((a, b) => a + b, 0);

  const calcularTotalPreco = () =>
    Object.entries(carrinho).reduce((total, [id, qtd]) => {
      const produto = produtos.find(p => p.id === Number(id));
      return total + (produto ? produto.preco * qtd : 0);
    }, 0);

  const finalizarPedido = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim() || !telefone.trim() || !endereco.trim()) {
      adicionarToast('Preencha nome, telefone e endereço!', 'erro');
      return;
    }
    if (totalItens === 0) {
      adicionarToast('Adicione itens ao carrinho!', 'erro');
      return;
    }

    setEnviando(true);

    try {
      const { data: { user }, error: errAuth } = await supabase.auth.getUser();
      if (errAuth || !user) {
        adicionarToast('Você precisa estar logado para finalizar o pedido!', 'erro');
        setEnviando(false);
        return;
      }

      const listaItens = Object.entries(carrinho).map(([id, qtd]) => {
        const p = produtos.find(prod => prod.id === Number(id));
        return {
          id: Number(id),
          nome: p?.nome ?? 'Produto',
          preco: p?.preco ?? 0,
          quantidade: qtd,
          subtotal: (p?.preco ?? 0) * qtd,
        };
      });

      const valorTotal = calcularTotalPreco();

      const { data: pedidoCriado, error: errPedido } = await supabase
        .from('pedidos')
        .insert([{
          cliente_id: user.id,
          endereco_entrega: endereco,
          valor_total: valorTotal,
          itens: listaItens,
          status: 'Pendente',
        }])
        .select('id')
        .maybeSingle();

      if (errPedido) {
        console.error('[Pedido] Erro ao gravar pedido:', errPedido);
        throw new Error(errPedido.message);
      }

      adicionarToast('Pedido registrado! Abrindo WhatsApp...', 'sucesso');

      let msg = `*NOVO PEDIDO - VIVA LEVE*\n\n`;
      msg += `*Cliente:* ${nome}\n`;
      msg += `*Telefone:* ${telefone}\n`;
      msg += `*Endereço:* ${endereco}\n`;
      msg += `*Pedido ID:* ${pedidoCriado?.id ?? ''}\n\n`;
      msg += `*ITENS:*\n`;
      listaItens.forEach(item => {
        msg += `  • ${item.quantidade}x ${item.nome} — R$ ${item.subtotal.toFixed(2)}\n`;
      });
      msg += `\n*TOTAL: R$ ${valorTotal.toFixed(2)}*`;

      setCarrinho({});
      setVerCarrinho(false);

      setTimeout(() => {
        window.open(`https://wa.me/${WHATSAPP_DONO}?text=${encodeURIComponent(msg)}`, '_blank');
      }, 800);

    } catch (err: any) {
      console.error('[Pedido] Falha:', err);
      adicionarToast('Erro ao enviar pedido: ' + (err.message ?? 'tente novamente'), 'erro');
    } finally {
      setEnviando(false);
    }
  };

  const categorias = Array.from(new Set(produtos.map(p => p.categoria)));

  return (
    <div className="min-h-screen bg-gray-50 font-sans max-w-md mx-auto shadow-2xl relative pb-20">

      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-3 rounded-xl text-sm font-semibold shadow-lg text-center ${
              t.tipo === 'sucesso' ? 'bg-green-500 text-white' :
              t.tipo === 'erro'   ? 'bg-red-500 text-white' :
                                    'bg-gray-800 text-white'
            }`}
          >
            {t.texto}
          </div>
        ))}
      </div>

      <header className="bg-viva-roxo text-white p-5 rounded-b-3xl shadow-md">
        <div className="flex justify-between items-center gap-3">
          <h1 className="text-2xl font-extrabold text-viva-verde tracking-tight">VIVA LEVE</h1>
          <Link href="/perfil" className="text-white/80 hover:text-white transition flex-shrink-0">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </Link>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <h2 className="font-bold text-gray-800 text-lg">Cardápio Virtual</h2>

        {carregando ? (
          <p className="text-center text-gray-500 animate-pulse py-10">Carregando refeições...</p>
        ) : erroCarga ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-red-600 font-semibold text-sm">Não foi possível carregar o cardápio.</p>
            <p className="text-red-400 text-xs mt-1">{erroCarga}</p>
          </div>
        ) : produtos.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">🥗</p>
            <p className="font-semibold">Nenhum item em estoque no momento.</p>
          </div>
        ) : (
          categorias.map(cat => {
            const itensCat = produtos.filter(p => p.categoria === cat);
            return (
              <div key={cat || 'sem-categoria'}>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 mt-3">{cat || 'Outros'}</h3>
                <div className="space-y-3">
                  {itensCat.map(item => (
                    <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex gap-4 relative">
                      {item.imagem_url ? (
                        <img
                          src={item.imagem_url}
                          alt={item.nome}
                          className="w-20 h-20 rounded-xl flex-shrink-0 object-cover"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-gradient-to-br from-green-50 to-green-100 rounded-xl flex-shrink-0 flex items-center justify-center text-3xl">
                          🥗
                        </div>
                      )}

                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <h3 className="font-bold text-gray-800 text-sm leading-tight">{item.nome}</h3>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.descricao}</p>
                          {item.kcal > 0 && (
                            <p className="text-[10px] text-gray-400 mt-1">{item.kcal} kcal · {item.proteinas}g prot</p>
                          )}
                        </div>

                        <div className="flex justify-between items-center mt-2">
                          <p className="font-extrabold text-viva-roxo text-base">R$ {Number(item.preco).toFixed(2)}</p>

                          {carrinho[item.id] ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => removerDoCarrinho(item.id)}
                                className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center text-sm active:scale-90 transition"
                              >
                                −
                              </button>
                              <span className="font-bold text-sm w-4 text-center text-gray-800">{carrinho[item.id]}</span>
                              <button
                                onClick={() => adicionarAoCarrinho(item.id)}
                                className="w-7 h-7 rounded-full bg-viva-verde text-viva-roxo font-bold flex items-center justify-center text-sm active:scale-90 transition"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => adicionarAoCarrinho(item.id)}
                              className="bg-viva-verde text-viva-roxo font-bold py-1.5 px-3 rounded-full text-xs shadow-sm active:scale-95 transition-transform"
                            >
                              + Adicionar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </main>

      {verCarrinho && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center max-w-md mx-auto">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-viva-roxo">Sua Sacola</h3>
              <button onClick={() => setVerCarrinho(false)} className="text-gray-400 text-sm font-semibold">Fechar ✕</button>
            </div>

            {totalItens === 0 ? (
              <p className="text-center text-gray-500 py-8">Sua sacola está vazia.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {Object.entries(carrinho).map(([id, qtd]) => {
                    const prod = produtos.find(p => p.id === Number(id));
                    if (!prod) return null;
                    return (
                      <div key={id} className="flex justify-between items-center text-sm py-2 border-b border-gray-100">
                        <span className="text-gray-700 flex-1 font-medium">{prod.nome}</span>
                        <div className="flex items-center gap-2 ml-2">
                          <button onClick={() => removerDoCarrinho(prod.id)} className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 font-bold flex items-center justify-center text-xs active:scale-90">−</button>
                          <span className="font-bold w-4 text-center">{qtd}</span>
                          <button onClick={() => adicionarAoCarrinho(prod.id)} className="w-6 h-6 rounded-full bg-viva-verde text-viva-roxo font-bold flex items-center justify-center text-xs active:scale-90">+</button>
                          <span className="font-bold text-viva-roxo w-16 text-right">R$ {(prod.preco * qtd).toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex justify-between font-extrabold text-lg pt-2 text-gray-800">
                    <span>Total:</span>
                    <span className="text-viva-roxo">R$ {calcularTotalPreco().toFixed(2)}</span>
                  </div>
                </div>

                <form onSubmit={finalizarPedido} className="space-y-4 pt-2 border-t border-gray-100">
                  <h4 className="font-bold text-sm text-gray-500 uppercase tracking-wider">Dados para Entrega</h4>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Nome completo *</label>
                    <input required type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">WhatsApp *</label>
                    <input required type="tel" value={telefone} onChange={e => setTelefone(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Endereço de entrega *</label>
                    <input required type="text" value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, Quadra, Bairro..." className="w-full p-2.5 border border-gray-200 rounded-xl text-sm" />
                  </div>

                  <button
                    type="submit"
                    disabled={enviando}
                    className="w-full bg-viva-roxo text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.99] transition-all disabled:opacity-60 text-center"
                  >
                    {enviando ? 'Processando...' : 'Confirmar Pedido'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 flex justify-around p-3 pb-5 z-10">
        <Link href="/" className="flex flex-col items-center text-viva-roxo">
          <span className="text-xl">🏠</span>
          <span className="text-[10px] font-bold mt-1">Loja</span>
        </Link>

        <button onClick={() => setVerCarrinho(true)} className="flex flex-col items-center text-gray-400 relative hover:text-viva-roxo transition">
          <span className="text-xl">🛒</span>
          <span className="text-[10px] font-bold mt-1">Carrinho</span>
          {totalItens > 0 && (
            <span className="absolute -top-1.5 -right-2 bg-red-500 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center font-bold">
              {totalItens}
            </span>
          )}
        </button>

        <Link href="/pedidos" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo transition">
          <span className="text-xl">📋</span>
          <span className="text-[10px] font-bold mt-1">Pedidos</span>
        </Link>

        <Link href="/dieta" className="flex flex-col items-center text-gray-400 hover:text-viva-roxo transition">
          <span className="text-xl">📱</span>
          <span className="text-[10px] font-bold mt-1">Dieta</span>
        </Link>
      </nav>
    </div>
  );
}
