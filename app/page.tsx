"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabase';
import Logo from '../components/Logo';

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
  porcao_g?: number;
  imagem_url?: string;
  ativo: boolean;
}

interface CupomDesconto {
  id: string;
  percentual_desconto: number;
  data_validade: string;
}

interface CanalLoja {
  nome_rede: string;
  endereco: string;
}

interface PerfilPedido {
  nome: string;
  telefone: string;
  endereco: string;
  regiao: string;
}

interface Toast {
  id: number;
  texto: string;
  tipo: 'sucesso' | 'erro' | 'info';
}

const FRETE_PADRAO = 10;
const LIMITE_FRETE_GRATIS = 100;
const LIMITE_DESCONTO_AUTOMATICO = 300;
const DESCONTO_AUTOMATICO_PERCENTUAL = 10;

let toastId = 0;

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

function somenteDigitos(valor: string) {
  return valor.replace(/\D/g, '');
}

function normalizarTexto(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function CanalIcone({ nome }: { nome: string }) {
  const rede = nome.toLowerCase();

  if (rede.includes('instagram')) {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="5.2" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  if (rede.includes('whatsapp')) {
    return (
      <svg className="h-8 w-8" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true">
        <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32 101.3 32 1.6 131.7 1.6 254.3c0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.6 0 222.3-99.7 222.3-222.3 0-59.3-23.1-115-65.3-156.7zM223.9 438.7h-.1c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3 18.6-68.1-4.4-7c-18.5-29.4-28.2-63.3-28.2-98 0-101.3 82.4-183.7 183.8-183.7 49.1 0 95.2 19.1 129.9 53.8 34.7 34.7 53.8 80.9 53.7 130 0 101.4-82.4 183.8-183.8 183.8zm100.8-137.7c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.5-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.5-19.4 19-19.4 46.3s19.9 53.7 22.6 57.4c2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
      </svg>
    );
  }

  return <span className="text-[11px] font-black leading-none">iF</span>;
}

export default function LojaCliente() {
  const router = useRouter();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [canais, setCanais] = useState<CanalLoja[]>([]);
  const [cupons, setCupons] = useState<CupomDesconto[]>([]);
  const [cupomSelecionadoId, setCupomSelecionadoId] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [carrinho, setCarrinho] = useState<{ [key: number]: number }>({});
  const [verCarrinho, setVerCarrinho] = useState(false);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [metodoPagamento, setMetodoPagamento] = useState<'checkout' | 'pix'>('checkout');
  const [pixGerado, setPixGerado] = useState<{ qrCode: string; qrCodeBase64?: string; ticketUrl?: string } | null>(null);
  const [produtoExpandidoId, setProdutoExpandidoId] = useState<number | null>(null);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('todos');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const adicionarToast = useCallback((texto: string, tipo: Toast['tipo'] = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, texto, tipo }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const carregarCupons = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('cupons_desconto')
      .select('id, percentual_desconto, data_validade')
      .eq('cliente_id', userId)
      .eq('status', 'aberto')
      .gte('data_validade', new Date().toISOString())
      .order('data_validade', { ascending: true });

    if (error) return;
    const lista = (data ?? []) as CupomDesconto[];
    setCupons(lista);
    setCupomSelecionadoId(lista[0]?.id ?? '');
  }, []);

  useEffect(() => {
    async function init() {
      setCarregando(true);
      setErroCarga(null);

      try {
        const [produtosRes, canaisRes] = await Promise.all([
          supabase
            .from('produtos')
            .select('*')
            .eq('ativo', true)
            .gt('estoque', 0)
            .order('categoria', { ascending: true }),
          supabase
            .from('canais_loja')
            .select('nome_rede,endereco')
            .eq('ativo', true)
            .order('nome_rede', { ascending: true }),
        ]);

        if (produtosRes.error) throw new Error(produtosRes.error.message);
        setProdutos(produtosRes.data ?? []);
        if (!canaisRes.error) setCanais((canaisRes.data ?? []) as CanalLoja[]);
      } catch (err: any) {
        console.error('[Loja] Erro ao carregar produtos:', err);
        setErroCarga(err.message);
      } finally {
        setCarregando(false);
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

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
          setEndereco([
            perfilCliente.endereco_rua,
            perfilCliente.endereco_numero,
            perfilCliente.bairro,
            perfilCliente.regiao_df,
          ].filter(Boolean).join(', '));
        }

        await carregarCupons(user.id);
      } catch (err) {
        console.error('[Loja] Erro ao carregar perfil:', err);
      }
    }

    init();
  }, [carregarCupons]);

  useEffect(() => {
    if (produtos.length === 0) return;
    const bruto = localStorage.getItem('viva-leve-plano-carrinho');
    if (!bruto) return;

    try {
      const itens = JSON.parse(bruto) as Record<string, number>;
      const disponiveis = new Set(produtos.map(produto => String(produto.id)));
      const validos = Object.fromEntries(
        Object.entries(itens)
          .filter(([id, qtd]) => disponiveis.has(id) && Number(qtd) > 0)
          .map(([id, qtd]) => [Number(id), Number(qtd)]),
      );

      if (Object.keys(validos).length > 0) {
        setCarrinho(prev => ({ ...prev, ...validos }));
        setVerCarrinho(true);
        adicionarToast('Itens do Plano Nutri adicionados a sacola.', 'sucesso');
      }
    } catch {
      adicionarToast('Nao foi possivel importar os itens do Plano Nutri.', 'erro');
    } finally {
      localStorage.removeItem('viva-leve-plano-carrinho');
    }
  }, [produtos, adicionarToast]);

  const subtotalProdutos = useMemo(() => Object.entries(carrinho).reduce((total, [id, qtd]) => {
    const produto = produtos.find(p => p.id === Number(id));
    return total + (produto ? produto.preco * qtd : 0);
  }, 0), [carrinho, produtos]);

  const cupomSelecionado = cupons.find(cupom => cupom.id === cupomSelecionadoId);
  const descontoCupomPercentual = Number(cupomSelecionado?.percentual_desconto ?? 0);
  const descontoAutomaticoPercentual = subtotalProdutos >= LIMITE_DESCONTO_AUTOMATICO ? DESCONTO_AUTOMATICO_PERCENTUAL : 0;
  const descontoPercentual = Math.max(descontoCupomPercentual, descontoAutomaticoPercentual);
  const descontoValor = subtotalProdutos * (descontoPercentual / 100);
  const valorFrete = subtotalProdutos > 0 && subtotalProdutos < LIMITE_FRETE_GRATIS ? FRETE_PADRAO : 0;
  const totalPedidoFinal = Math.max(subtotalProdutos - descontoValor + valorFrete, 0);
  const totalItens = Object.values(carrinho).reduce((a, b) => a + b, 0);
  const mensagensPromocionais = useMemo(() => {
    const mensagens = [
      '🚚 Prazo de entrega: 24hs (amanhã).',
      `💸 Ganhe ${DESCONTO_AUTOMATICO_PERCENTUAL}% de desconto em compras acima de ${formatarMoedaBR(LIMITE_DESCONTO_AUTOMATICO)}.`,
      `📦 Frete Grátis nas compras acima de ${formatarMoedaBR(LIMITE_FRETE_GRATIS)}.`,
    ];

    cupons.forEach(cupom => {
      mensagens.push(`🎟️ Você tem ${formatarNumeroBR(cupom.percentual_desconto, 0)}% em cupom de desconto. APROVEITE!!!`);
    });

    return mensagens;
  }, [cupons]);

  const canalPorNome = (nomeRede: string) => canais.find(canal => canal.nome_rede.toLowerCase() === nomeRede.toLowerCase());

  const validarCadastroPedido = async (userId: string): Promise<PerfilPedido> => {
    const [{ data: perfil, error: errPerfil }, { data: perfilCliente, error: errCliente }] = await Promise.all([
      supabase
        .from('perfis')
        .select('nome, telefone')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('perfis_clientes')
        .select('endereco_rua, endereco_numero, bairro, regiao_df')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    if (errPerfil) throw new Error(errPerfil.message);
    if (errCliente) throw new Error(errCliente.message);

    const nomePerfil = String(perfil?.nome ?? nome).trim();
    const telefonePerfil = String(perfil?.telefone ?? telefone).trim();
    const digitosTelefone = somenteDigitos(telefonePerfil);
    const rua = String(perfilCliente?.endereco_rua ?? '').trim();
    const numero = String(perfilCliente?.endereco_numero ?? '').trim();
    const bairroPerfil = String(perfilCliente?.bairro ?? '').trim();
    const regiao = String(perfilCliente?.regiao_df ?? '').trim();
    const cadastroCompleto = Boolean(nomePerfil && digitosTelefone.length >= 10 && rua && numero && bairroPerfil && regiao);

    if (!cadastroCompleto) {
      adicionarToast('Cadastro incompleto. Informe nome, telefone com DDD e endereco de entrega no perfil.', 'erro');
      setTimeout(() => router.push('/perfil'), 1300);
      throw new Error('Cadastro incompleto para finalizar pedido.');
    }

    const { data: regioes, error: errRegiao } = await supabase
      .from('regioes_atendimento')
      .select('regiao, uf, status')
      .eq('status', 'ativa');

    if (errRegiao) throw new Error(errRegiao.message);

    const regiaoAtiva = (regioes ?? []).some(item => normalizarTexto(item.regiao) === normalizarTexto(regiao));
    if (!regiaoAtiva) {
      adicionarToast('Ainda nao atendemos essa regiao. Atualize a regiao de entrega no perfil.', 'erro');
      throw new Error('Regiao de entrega fora da area ativa de atendimento.');
    }

    const enderecoPerfil = [rua, numero, bairroPerfil, regiao].filter(Boolean).join(', ');
    setNome(nomePerfil);
    setTelefone(telefonePerfil);
    setEndereco(enderecoPerfil);

    return {
      nome: nomePerfil,
      telefone: telefonePerfil,
      endereco: enderecoPerfil,
      regiao,
    };
  };

  const adicionarAoCarrinho = (id: number) => {
    const produto = produtos.find(p => p.id === id);
    if (!produto || !produto.ativo || Number(produto.estoque || 0) <= 0) {
      adicionarToast('Produto sem estoque no momento.', 'erro');
      return;
    }

    const quantidadeAtual = carrinho[id] || 0;
    if (quantidadeAtual >= Number(produto.estoque || 0)) {
      adicionarToast(`Limite de estoque atingido: ${produto.estoque} unidade(s).`, 'erro');
      return;
    }

    setCarrinho(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    adicionarToast(`${produto.nome} adicionado!`, 'sucesso');
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

  const revalidarEstoqueCarrinho = async () => {
    const ids = Object.keys(carrinho).map(Number);
    if (ids.length === 0) return [];

    const { data, error } = await supabase
      .from('produtos')
      .select('id,nome,preco,estoque,ativo')
      .in('id', ids);

    if (error) throw new Error(error.message);

    const produtosAtualizados = (data ?? []) as Produto[];
    const mapa = new Map(produtosAtualizados.map(produto => [produto.id, produto]));
    const carrinhoCorrigido = { ...carrinho };
    let erroEstoque = '';

    for (const [idTexto, qtd] of Object.entries(carrinho)) {
      const id = Number(idTexto);
      const produto = mapa.get(id);
      if (!produto || !produto.ativo || Number(produto.estoque || 0) <= 0) {
        delete carrinhoCorrigido[id];
        erroEstoque = `"${produto?.nome ?? 'Produto'}" nao esta mais disponivel.`;
        continue;
      }
      if (qtd > Number(produto.estoque || 0)) {
        carrinhoCorrigido[id] = Number(produto.estoque || 0);
        erroEstoque = `Estoque insuficiente para "${produto.nome}". Disponivel: ${produto.estoque} unidade(s).`;
      }
    }

    setProdutos(prev => prev.map(produto => {
      const atualizado = mapa.get(produto.id);
      return atualizado ? { ...produto, ...atualizado } : produto;
    }));
    setCarrinho(carrinhoCorrigido);

    if (erroEstoque) throw new Error(erroEstoque);
    return produtosAtualizados;
  };

  const finalizarPedido = async (e: React.FormEvent) => {
    e.preventDefault();

    if (totalItens === 0) {
      adicionarToast('Adicione itens ao carrinho!', 'erro');
      return;
    }

    setEnviando(true);

    try {
      const { data: { session }, error: errSession } = await supabase.auth.getSession();
      const user = session?.user;
      if (errSession || !session || !user) {
        adicionarToast('Voce precisa estar logado para finalizar o pedido!', 'erro');
        setEnviando(false);
        return;
      }

      const cadastroPedido = await validarCadastroPedido(user.id);
      const estoqueAtualizado = await revalidarEstoqueCarrinho();
      const produtosParaPedido = estoqueAtualizado.length > 0 ? estoqueAtualizado : produtos;

      const listaItens = Object.entries(carrinho).map(([id, qtd]) => {
        const produto = produtosParaPedido.find(prod => prod.id === Number(id));
        return {
          id: Number(id),
          nome: produto?.nome ?? 'Produto',
          preco: produto?.preco ?? 0,
          quantidade: qtd,
          subtotal: (produto?.preco ?? 0) * qtd,
        };
      });

      const subtotalValidado = listaItens.reduce((total, item) => total + item.subtotal, 0);
      const freteValidado = subtotalValidado > 0 && subtotalValidado < LIMITE_FRETE_GRATIS ? FRETE_PADRAO : 0;
      const descontoAutomaticoValidado = subtotalValidado >= LIMITE_DESCONTO_AUTOMATICO ? DESCONTO_AUTOMATICO_PERCENTUAL : 0;
      const descontoCupomValidado = cupomSelecionado ? Number(cupomSelecionado.percentual_desconto) : 0;
      const descontoPercentualValidado = Math.max(descontoAutomaticoValidado, descontoCupomValidado);
      const descontoValorValidado = subtotalValidado * (descontoPercentualValidado / 100);
      const valorTotal = Math.max(subtotalValidado - descontoValorValidado + freteValidado, 0);

      const { data: pedidoCriado, error: errPedido } = await supabase
        .from('pedidos')
        .insert([{
          cliente_id: user.id,
          endereco_entrega: cadastroPedido.endereco,
          subtotal_produtos: subtotalValidado,
          valor_frete: freteValidado,
          desconto_percentual: descontoPercentualValidado,
          desconto_valor: descontoValorValidado,
          cupom_id: cupomSelecionado?.id ?? null,
          valor_total: valorTotal,
          itens: listaItens,
          status: 'Aguardando Pagamento',
        }])
        .select('id')
        .maybeSingle();

      if (errPedido) throw new Error(errPedido.message);

      const respostaPagamento = await fetch(metodoPagamento === 'pix' ? '/api/mercadopago/pix' : '/api/mercadopago/preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pedidoId: pedidoCriado?.id,
          itens: listaItens,
          payer: {
            nome: cadastroPedido.nome,
            telefone: cadastroPedido.telefone,
            email: user.email,
          },
        }),
      });

      const pagamento = await respostaPagamento.json();
      if (!respostaPagamento.ok) throw new Error(pagamento.error || 'Erro ao iniciar pagamento.');

      if (metodoPagamento === 'pix') {
        setPixGerado({
          qrCode: pagamento.qrCode,
          qrCodeBase64: pagamento.qrCodeBase64,
          ticketUrl: pagamento.ticketUrl,
        });
        setCarrinho({});
        setVerCarrinho(false);
        setCupomSelecionadoId('');
        adicionarToast('Pix gerado. Copie o codigo para pagar.', 'sucesso');
        return;
      }

      const checkoutUrl = pagamento.initPoint || pagamento.sandboxInitPoint;
      if (!checkoutUrl) throw new Error('Mercado Pago nao retornou a URL de pagamento.');

      setCarrinho({});
      setVerCarrinho(false);
      setCupomSelecionadoId('');
      adicionarToast('Pedido registrado. Redirecionando para pagamento...', 'sucesso');
      window.location.href = checkoutUrl;
    } catch (err: any) {
      console.error('[Pedido] Falha:', err);
      adicionarToast('Erro ao enviar pedido: ' + (err.message ?? 'tente novamente'), 'erro');
    } finally {
      setEnviando(false);
    }
  };

  const categorias = Array.from(new Set(produtos.map(p => p.categoria))).filter(Boolean);
  const categoriasVisiveis = categoriaSelecionada === 'todos' ? categorias : categorias.filter(cat => cat === categoriaSelecionada);
  const instagram = canalPorNome('Instagram');
  const whatsapp = canalPorNome('WhatsApp');

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-gray-50 pb-24 font-sans shadow-2xl">
      <div className="pointer-events-none fixed left-1/2 top-4 z-[100] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 space-y-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`rounded-xl px-4 py-3 text-center text-sm font-semibold shadow-lg ${
              t.tipo === 'sucesso' ? 'bg-green-500 text-white' :
              t.tipo === 'erro' ? 'bg-red-500 text-white' :
              'bg-gray-800 text-white'
            }`}
          >
            {t.texto}
          </div>
        ))}
      </div>

      <header className="border-b border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Logo />
          </div>
          <Link href="/perfil" className="p-1 text-gray-400 hover:text-viva-roxo" aria-label="Abrir perfil">
            <span className="text-xl">&#128100;</span>
          </Link>
        </div>
        {categorias.length > 0 && (
          <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <button
              type="button"
              onClick={() => setCategoriaSelecionada('todos')}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${
                categoriaSelecionada === 'todos'
                  ? 'bg-viva-roxo text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              Todos
            </button>
            {categorias.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoriaSelecionada(cat)}
                className={`flex-shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${
                  categoriaSelecionada === cat
                    ? 'bg-viva-roxo text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
        {/*
          <a href="#" target="_blank" rel="noreferrer" className="hidden">
            iFood · Viva-Leve no Ifood
          </a>
        */}
      </header>

      <main className="space-y-4 p-4">
        <Link href="/dieta" className="block rounded-2xl bg-gradient-to-r from-viva-roxo to-gray-900 p-4 text-white shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-viva-verde">Novidade</p>
          <p className="mt-1 text-sm font-black">Gere sua dieta personalizada gratuita e descubra exatamente quais marmitas comprar.</p>
          <p className="mt-2 text-xs font-bold text-white/75">Clique aqui e crie seu Plano Nutri.</p>
        </Link>

        <div className="overflow-hidden rounded-2xl border border-viva-verde/40 bg-viva-verde/20 py-3 text-xs font-black text-viva-roxo">
          <div className="viva-marquee flex w-max items-center whitespace-nowrap px-4">
            {[...mensagensPromocionais, ...mensagensPromocionais].map((mensagem, index) => (
              <span key={`${mensagem}-${index}`} className="mx-4 inline-flex items-center gap-4">
                <span>{mensagem}</span>
                <span className="text-viva-roxo/50">✨</span>
              </span>
            ))}
          </div>
        </div>

        {carregando ? (
          <p className="animate-pulse py-10 text-center text-gray-500">Carregando refeicoes...</p>
        ) : erroCarga ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-semibold text-red-600">Nao foi possivel carregar o cardapio.</p>
            <p className="mt-1 text-xs text-red-400">{erroCarga}</p>
          </div>
        ) : produtos.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            <p className="mb-3 text-4xl">VL</p>
            <p className="font-semibold">Nenhum item em estoque no momento.</p>
          </div>
        ) : (
          categoriasVisiveis.map(cat => (
            <div key={cat || 'sem-categoria'}>
              <h3 className="mb-2 mt-3 text-xs font-bold uppercase tracking-widest text-gray-400">{cat || 'Outros'}</h3>
              <div className="space-y-3">
                {produtos.filter(p => p.categoria === cat).map(item => {
                  const expandido = produtoExpandidoId === item.id;

                  return (
                  <div key={item.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                    <button type="button" onClick={() => setProdutoExpandidoId(expandido ? null : item.id)} className="flex w-full gap-4 p-4 text-left" aria-expanded={expandido}>
                    {item.imagem_url ? (
                      <img src={item.imagem_url} alt={item.nome} className="h-20 w-20 flex-shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-50 to-green-100 text-lg font-black text-viva-roxo">
                        VL
                      </div>
                    )}

                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-bold leading-tight text-gray-800">{item.nome}</h3>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{item.descricao}</p>
                        {(item.kcal > 0 || item.proteinas > 0 || item.carboidratos > 0 || item.gorduras > 0 || item.porcao_g) && (
                          <>
                          <p className="mt-1 text-[10px] text-gray-400">
                            {item.porcao_g ? <><strong className="font-black text-gray-600">porcao</strong> {formatarNumeroBR(item.porcao_g, 0)}g · </> : ''}
                            {formatarNumeroBR(item.kcal, 0)} kcal · {formatarNumeroBR(item.proteinas)}g prot · {formatarNumeroBR(item.carboidratos)}g carb · {formatarNumeroBR(item.gorduras)}g gord
                          </p>
                          <p className="hidden">
                            {item.porcao_g ? `${formatarNumeroBR(item.porcao_g, 0)}g porcao · ` : ''}
                            {formatarNumeroBR(item.kcal, 0)} kcal · {formatarNumeroBR(item.proteinas)}g prot · {formatarNumeroBR(item.carboidratos)}g carb · {formatarNumeroBR(item.gorduras)}g gord
                          </p>
                          </>
                        )}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-base font-extrabold text-viva-roxo">{formatarMoedaBR(item.preco)}</p>
                        <span className="text-xs font-black text-viva-roxo">{expandido ? 'Fechar detalhes' : 'Ver detalhes'}</span>
                      </div>
                    </div>
                    </button>

                    {expandido && (
                      <div className="space-y-3 border-t border-gray-100 bg-gray-50 p-4">
                        {item.imagem_url ? (
                          <img src={item.imagem_url} alt={item.nome} className="h-56 w-full rounded-xl object-cover" />
                        ) : (
                          <div className="flex h-40 w-full items-center justify-center rounded-xl bg-gradient-to-br from-green-50 to-green-100 text-3xl font-black text-viva-roxo">
                            VL
                          </div>
                        )}
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Descricao e ingredientes</h4>
                          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-700">{item.descricao || 'Sem descricao cadastrada.'}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                      <p className="text-xs font-semibold text-gray-400">Toque no card para detalhes</p>
                      {carrinho[item.id] ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => removerDoCarrinho(item.id)} className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600 transition active:scale-90">-</button>
                          <span className="w-4 text-center text-sm font-bold text-gray-800">{carrinho[item.id]}</span>
                          <button onClick={() => adicionarAoCarrinho(item.id)} disabled={carrinho[item.id] >= Number(item.estoque || 0)} className="flex h-7 w-7 items-center justify-center rounded-full bg-viva-verde text-sm font-bold text-viva-roxo transition active:scale-90 disabled:opacity-40">+</button>
                        </div>
                      ) : (
                        <button onClick={() => adicionarAoCarrinho(item.id)} disabled={Number(item.estoque || 0) <= 0} className="rounded-full bg-viva-verde px-3 py-1.5 text-xs font-bold text-viva-roxo shadow-sm transition-transform active:scale-95 disabled:opacity-40">
                          + Adicionar
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>

      {verCarrinho && (
        <div className="fixed inset-0 z-50 mx-auto flex max-w-md items-end justify-center bg-black/50">
          <div className="max-h-[92vh] w-full space-y-5 overflow-y-auto rounded-t-3xl bg-white p-6">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-viva-roxo">Sua Sacola</h3>
              <button onClick={() => setVerCarrinho(false)} className="text-sm font-semibold text-gray-400">Fechar</button>
            </div>

            {totalItens === 0 ? (
              <p className="py-8 text-center text-gray-500">Sua sacola esta vazia.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {Object.entries(carrinho).map(([id, qtd]) => {
                    const prod = produtos.find(p => p.id === Number(id));
                    if (!prod) return null;
                    return (
                      <div key={id} className="flex items-center justify-between border-b border-gray-100 py-2 text-sm">
                        <span className="flex-1 font-medium text-gray-700">{prod.nome}</span>
                        <div className="ml-2 flex items-center gap-2">
                          <button onClick={() => removerDoCarrinho(prod.id)} className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 active:scale-90">-</button>
                          <span className="w-4 text-center font-bold">{qtd}</span>
                          <button onClick={() => adicionarAoCarrinho(prod.id)} className="flex h-6 w-6 items-center justify-center rounded-full bg-viva-verde text-xs font-bold text-viva-roxo active:scale-90">+</button>
                          <span className="w-16 text-right font-bold text-viva-roxo">{formatarMoedaBR(prod.preco * qtd)}</span>
                        </div>
                      </div>
                    );
                  })}

                  <div className="rounded-xl bg-viva-verde/20 p-3 text-center text-xs font-black text-viva-roxo">
                    Frete gratis em compras a partir de {formatarMoedaBR(LIMITE_FRETE_GRATIS)}. Compras acima de {formatarMoedaBR(LIMITE_DESCONTO_AUTOMATICO)} ganham 10% de desconto.
                  </div>

                  {cupons.length > 0 && (
                    <div className="rounded-xl border border-purple-100 bg-purple-50 p-3">
                      <label className="mb-1 block text-xs font-bold text-viva-roxo">Cupom disponivel</label>
                      <select value={cupomSelecionadoId} onChange={e => setCupomSelecionadoId(e.target.value)} className="w-full rounded-lg border border-purple-100 bg-white p-2 text-sm font-semibold text-gray-700">
                        <option value="">Nao aplicar cupom</option>
                        {cupons.map(cupom => (
                          <option key={cupom.id} value={cupom.id}>
                            {formatarNumeroBR(cupom.percentual_desconto, 0)}% de desconto · valido ate {new Date(cupom.data_validade).toLocaleDateString('pt-BR')}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1 border-t border-gray-100 pt-2 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>{formatarMoedaBR(subtotalProdutos)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Frete</span>
                      <span>{valorFrete === 0 ? 'Gratis' : formatarMoedaBR(valorFrete)}</span>
                    </div>
                    {descontoPercentual > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>Desconto ({formatarNumeroBR(descontoPercentual, 0)}%)</span>
                        <span>- {formatarMoedaBR(descontoValor)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 text-lg font-extrabold text-gray-800">
                      <span>Total:</span>
                      <span className="text-viva-roxo">{formatarMoedaBR(totalPedidoFinal)}</span>
                    </div>
                  </div>
                </div>

                <form onSubmit={finalizarPedido} className="space-y-4 border-t border-gray-100 pt-2">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500">Dados para Entrega</h4>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-600">Nome completo *</label>
                    <input required type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full rounded-xl border border-gray-200 p-2.5 text-sm text-gray-900" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-600">WhatsApp *</label>
                    <input required type="tel" value={telefone} onChange={e => setTelefone(e.target.value)} className="w-full rounded-xl border border-gray-200 p-2.5 text-sm text-gray-900" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-600">Endereco de entrega *</label>
                    <input required type="text" value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, Quadra, Bairro..." className="w-full rounded-xl border border-gray-200 p-2.5 text-sm text-gray-900" />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold text-gray-600">Meio de pagamento</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setMetodoPagamento('checkout')} className={`rounded-xl border px-3 py-2 text-xs font-black ${metodoPagamento === 'checkout' ? 'border-viva-roxo bg-viva-roxo text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                        Cartao / Debito
                      </button>
                      <button type="button" onClick={() => setMetodoPagamento('pix')} className={`rounded-xl border px-3 py-2 text-xs font-black ${metodoPagamento === 'pix' ? 'border-viva-roxo bg-viva-roxo text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                        Pix copia e cola
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={enviando} className="w-full rounded-xl bg-viva-roxo py-3.5 text-center font-bold text-white shadow-lg transition-all active:scale-[0.99] disabled:opacity-60">
                    {enviando ? 'Processando...' : 'Confirmar Pedido'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {pixGerado && (
        <div className="fixed inset-0 z-[70] mx-auto flex max-w-md items-center justify-center bg-black/60 p-4">
          <div className="w-full rounded-2xl bg-white p-5 text-center shadow-2xl">
            <h3 className="text-lg font-black text-viva-roxo">Pix gerado</h3>
            <p className="mt-1 text-xs font-semibold text-gray-500">Copie o codigo Pix no seu banco para concluir o pagamento.</p>
            {pixGerado.qrCodeBase64 && (
              <img src={`data:image/png;base64,${pixGerado.qrCodeBase64}`} alt="QR Code Pix" className="mx-auto mt-4 h-44 w-44" />
            )}
            <textarea readOnly value={pixGerado.qrCode} className="mt-4 h-24 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700" />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(pixGerado.qrCode);
                adicionarToast('Codigo Pix copiado.', 'sucesso');
              }}
              className="mt-3 w-full rounded-xl bg-viva-roxo py-3 text-sm font-black text-white"
            >
              Copiar codigo Pix
            </button>
            {pixGerado.ticketUrl && (
              <a href={pixGerado.ticketUrl} target="_blank" rel="noreferrer" className="mt-3 block text-xs font-bold text-viva-roxo">
                Abrir comprovante no Mercado Pago
              </a>
            )}
            <Link href="/pedidos" onClick={() => setPixGerado(null)} className="mt-3 block rounded-xl bg-gray-100 py-3 text-sm font-bold text-gray-700">
              Ver meus pedidos
            </Link>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setVerCarrinho(true)}
        className="fixed bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-viva-roxo px-5 py-3 text-sm font-black text-white shadow-xl transition active:scale-95"
      >
        <span>Sacola</span>
        {totalItens > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-viva-verde px-1.5 text-[10px] font-black text-viva-roxo">
            {totalItens}
          </span>
        )}
      </button>

      {instagram && (
        <a
          href={instagram.endereco}
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram Viva Leve"
          title="Instagram Viva Leve"
          className="fixed bottom-24 left-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-viva-roxo to-orange-400 text-white shadow-xl ring-4 ring-white transition active:scale-95"
        >
          <CanalIcone nome={instagram.nome_rede} />
        </a>
      )}

      {whatsapp && (
        <a
          href={whatsapp.endereco}
          target="_blank"
          rel="noreferrer"
          aria-label="WhatsApp Viva Leve"
          title="WhatsApp Viva Leve"
          className="fixed bottom-24 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg ring-4 ring-white transition hover:scale-110 active:scale-95"
        >
          <CanalIcone nome={whatsapp.nome_rede} />
        </a>
      )}

      <nav className="fixed bottom-0 z-10 flex w-full max-w-md justify-around border-t border-gray-200 bg-white p-3 pb-5">
        <button className="flex flex-col items-center text-viva-roxo">
          <span className="text-xl">&#127968;</span>
          <span className="mt-1 text-[10px] font-bold">Loja</span>
        </button>
        <Link href="/pedidos" className="flex flex-col items-center text-gray-400 transition hover:text-viva-roxo">
          <span className="text-xl">&#128203;</span>
          <span className="mt-1 text-[10px] font-bold">Pedidos</span>
        </Link>
        <Link href="/dieta" className="flex flex-col items-center text-gray-400 transition hover:text-viva-roxo">
          <span className="text-xl">&#128241;</span>
          <span className="mt-1 text-[10px] font-bold">Dieta</span>
        </Link>
        <Link href="/perfil" className="flex flex-col items-center text-gray-400 transition hover:text-viva-roxo">
          <span className="text-xl">&#128100;</span>
          <span className="mt-1 text-[10px] font-bold">Perfil</span>
        </Link>
      </nav>
    </div>
  );
}
