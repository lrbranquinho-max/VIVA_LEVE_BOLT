"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../supabase';
import Logo from '../../../components/Logo';
import BottomNav from '../../../components/BottomNav';
import { DEFAULT_STORE_LAUNCH_AT } from '../../../lib/storeLaunch';
import { useStoreLaunch } from '../../../hooks/useStoreLaunch';
import PlanoKitSelector from '@/components/PlanoKitSelector';
import { PlanoConfig } from '@/lib/planosMarmitas';
import { estoqueDisponivelProduto } from '@/lib/stock';

interface Produto {
  tipo_produto?: 'avulso' | 'kit';
  plano_config?: PlanoConfig | null;
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  categoria: string;
  estoque: number;
  estoque_reservado?: number;
  estoque_disponivel?: number;
  kcal: number;
  proteinas: number;
  carboidratos: number;
  gorduras: number;
  porcao_g?: number;
  imagem_url?: string;
  ativo: boolean;
}

const CARRINHO_STORAGE_KEY = 'viva-leve-carrinho';

function formatarNumeroBR(valor: number | string, casas = 1) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function formatarMoedaBR(valor: number | string) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function lerCarrinho(): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(CARRINHO_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function salvarCarrinho(carrinho: Record<number, number>) {
  localStorage.setItem(CARRINHO_STORAGE_KEY, JSON.stringify(carrinho));
}

export default function ProdutoDetalhePage() {
  const params = useParams();
  const router = useRouter();
  const produtoId = Number(params?.id);
  const [produto, setProduto] = useState<Produto | null>(null);
  const [quantidade, setQuantidade] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [toast, setToast] = useState('');
  const [dataLiberacaoVendas, setDataLiberacaoVendas] = useState(DEFAULT_STORE_LAUNCH_AT);
  const { vendasLiberadas, dataLiberacaoCurta } = useStoreLaunch({ data_liberacao_vendas: dataLiberacaoVendas });

  const mostrarToast = useCallback((texto: string) => {
    setToast(texto);
    window.setTimeout(() => setToast(''), 3500);
  }, []);

  useEffect(() => {
    async function carregarProduto() {
      setCarregando(true);
      try {
        if (!Number.isFinite(produtoId)) throw new Error('Produto invalido.');

        const [produtoRes, configRes] = await Promise.all([
          supabase
            .from('produtos')
            .select('*')
            .eq('id', produtoId)
            .maybeSingle(),
          supabase
            .from('app_config')
            .select('valor')
            .eq('chave', 'loja_config')
            .maybeSingle(),
        ]);

        if (produtoRes.error) throw produtoRes.error;
        if (!produtoRes.data || !produtoRes.data.ativo) throw new Error('Produto nao encontrado.');
        setProduto(produtoRes.data as Produto);
        const dataConfigurada = configRes.data?.valor?.data_liberacao_vendas;
        if (!configRes.error && typeof dataConfigurada === 'string') setDataLiberacaoVendas(dataConfigurada);
      } catch (err: any) {
        mostrarToast(err.message || 'Nao foi possivel carregar o produto.');
      } finally {
        setCarregando(false);
      }
    }

    carregarProduto();
  }, [produtoId, mostrarToast]);

  const estoqueDisponivel = estoqueDisponivelProduto(produto);
  const total = useMemo(() => Number(produto?.preco ?? 0) * quantidade, [produto?.preco, quantidade]);

  const adicionarAoCarrinho = () => {
    if (!produto) return;
    if (!vendasLiberadas) {
      mostrarToast(`Disponivel para compra em ${dataLiberacaoCurta}.`);
      return;
    }
    if (estoqueDisponivel <= 0) {
      mostrarToast('Produto sem estoque no momento.');
      return;
    }

    const carrinho = lerCarrinho();
    const atual = Number(carrinho[produto.id] ?? 0);
    const proximaQuantidade = atual + quantidade;

    if (proximaQuantidade > estoqueDisponivel) {
      mostrarToast(`Limite de estoque atingido: ${estoqueDisponivel} unidade(s).`);
      return;
    }

    salvarCarrinho({ ...carrinho, [produto.id]: proximaQuantidade });
    mostrarToast('Produto adicionado a sacola.');
    window.setTimeout(() => router.push('/'), 600);
  };

  if (carregando) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-gray-50 text-sm font-bold text-gray-500 md:max-w-6xl">
        Carregando produto...
      </div>
    );
  }

  if (!produto) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-gray-50 p-6 font-sans md:max-w-6xl">
        {toast && <div className="rounded-xl bg-red-100 p-4 text-center text-sm font-bold text-red-700">{toast}</div>}
        <Link href="/" className="mt-4 inline-flex rounded-xl bg-viva-roxo px-4 py-3 text-sm font-black text-white">
          Voltar para loja
        </Link>
      </div>
    );
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-gray-50 pb-28 font-sans shadow-2xl md:max-w-6xl">
      {toast && (
        <button onClick={() => setToast('')} className="fixed left-1/2 top-4 z-[120] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl bg-gray-900 p-4 text-center text-sm font-bold text-white shadow-xl">
          {toast}
        </button>
      )}

      <header className="border-b border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Logo />
          </div>
          <Link href="/" className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-600">
            Voltar
          </Link>
        </div>
      </header>

      <main className="grid gap-6 p-4 md:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] md:p-6">
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {produto.imagem_url ? (
            <img src={produto.imagem_url} alt={produto.nome} className="h-80 w-full object-cover md:h-[520px]" />
          ) : (
            <div className="flex h-80 w-full items-center justify-center bg-gradient-to-br from-green-50 to-green-100 text-5xl font-black text-viva-roxo md:h-[520px]">
              VL
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wider text-viva-roxo">{produto.categoria || 'Produto'}</p>
            <h1 className="mt-2 text-2xl font-black leading-tight text-gray-900">{produto.nome}</h1>
            <p className="mt-3 text-2xl font-black text-viva-roxo">{formatarMoedaBR(produto.preco)}</p>
            {!vendasLiberadas ? (
              <span className="mt-3 inline-flex rounded-md bg-viva-roxo px-3 py-1.5 text-xs font-black text-viva-verde shadow-sm">
                Disponível a partir de {dataLiberacaoCurta}
              </span>
            ) : (
              <p className="mt-2 text-xs font-bold text-gray-400">{produto.tipo_produto === 'kit' ? 'Produção programada por entrega' : `Estoque disponivel: ${estoqueDisponivel} unidade(s)`}</p>
            )}
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">Descricao e ingredientes</h2>
            <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-relaxed text-gray-700">
              {produto.descricao || 'Sem descricao cadastrada.'}
            </p>
          </div>

          {produto.tipo_produto === 'kit' ? <PlanoKitSelector produto={produto} liberado={vendasLiberadas} /> : <>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="text-xs font-black uppercase tracking-wider text-gray-400">Informacoes nutricionais</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs md:grid-cols-5">
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="font-black text-gray-400">Porcao</p>
                <p className="mt-1 font-black text-gray-800">{produto.porcao_g ? `${formatarNumeroBR(produto.porcao_g, 0)}g` : '-'}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="font-black text-gray-400">Kcal</p>
                <p className="mt-1 font-black text-gray-800">{formatarNumeroBR(produto.kcal, 0)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="font-black text-gray-400">Prot.</p>
                <p className="mt-1 font-black text-gray-800">{formatarNumeroBR(produto.proteinas)}g</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="font-black text-gray-400">Carb.</p>
                <p className="mt-1 font-black text-gray-800">{formatarNumeroBR(produto.carboidratos)}g</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="font-black text-gray-400">Gord.</p>
                <p className="mt-1 font-black text-gray-800">{formatarNumeroBR(produto.gorduras)}g</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Quantidade</p>
                <p className="mt-1 text-lg font-black text-gray-900">Total: {formatarMoedaBR(total)}</p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setQuantidade(prev => Math.max(prev - 1, 1))} className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-lg font-black text-gray-600">-</button>
                <span className="w-8 text-center text-lg font-black text-gray-900">{quantidade}</span>
                <button type="button" onClick={() => setQuantidade(prev => Math.min(prev + 1, estoqueDisponivel || 1))} disabled={!vendasLiberadas} className="flex h-10 w-10 items-center justify-center rounded-full bg-viva-verde text-lg font-black text-viva-roxo disabled:opacity-40">+</button>
              </div>
            </div>
            <button type="button" onClick={adicionarAoCarrinho} disabled={!vendasLiberadas || estoqueDisponivel <= 0} className="mt-4 w-full rounded-xl bg-viva-verde py-4 text-sm font-black text-viva-roxo shadow-sm transition active:scale-[0.99] disabled:opacity-50">
              {!vendasLiberadas ? `Disponível em ${dataLiberacaoCurta}` : estoqueDisponivel <= 0 ? 'Esgotado' : 'Adicionar ao carrinho'}
            </button>
          </div>
          </>}
        </section>
      </main>

      <BottomNav active="loja" />
    </div>
  );
}
