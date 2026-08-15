"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../supabase';
import Logo from '../components/Logo';
import BottomNav from '../components/BottomNav';
import StoreFooter from '../components/StoreFooter';
import { MEIOS_PAGAMENTO_PADRAO, normalizarMeiosPagamento } from '../lib/paymentConfig';

declare global {
  interface Window {
    bpSop_silentOrderPost?: (options: Record<string, unknown>) => void;
    bpmpi_authenticate?: () => void;
    bpmpi_config?: () => Record<string, unknown>;
  }
}

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

const LIMITE_FRETE_GRATIS = 100;
const LIMITE_DESCONTO_AUTOMATICO = 300;
const DESCONTO_AUTOMATICO_PERCENTUAL = 10;
const CARRINHO_STORAGE_KEY = 'viva-leve-carrinho';
const LOJA_CONFIG_PADRAO = {
  cupom_boas_vindas_percentual: 30,
  taxa_entrega_padrao: 10,
  cupom_dia_d_percentual: 0,
  cupom_dia_d_ativo: false,
  meios_pagamento: MEIOS_PAGAMENTO_PADRAO,
};

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

function normalizarLojaConfig(valor: unknown) {
  const bruto = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>;
  const boasVindas = Number(bruto.cupom_boas_vindas_percentual ?? LOJA_CONFIG_PADRAO.cupom_boas_vindas_percentual);
  const taxa = Number(bruto.taxa_entrega_padrao ?? LOJA_CONFIG_PADRAO.taxa_entrega_padrao);
  const diaD = Number(bruto.cupom_dia_d_percentual ?? LOJA_CONFIG_PADRAO.cupom_dia_d_percentual);

  return {
    cupom_boas_vindas_percentual: Math.min(100, Math.max(0, Number.isFinite(boasVindas) ? boasVindas : LOJA_CONFIG_PADRAO.cupom_boas_vindas_percentual)),
    taxa_entrega_padrao: Math.max(0, Number.isFinite(taxa) ? taxa : LOJA_CONFIG_PADRAO.taxa_entrega_padrao),
    cupom_dia_d_percentual: Math.min(100, Math.max(0, Number.isFinite(diaD) ? diaD : LOJA_CONFIG_PADRAO.cupom_dia_d_percentual)),
    cupom_dia_d_ativo: Boolean(bruto.cupom_dia_d_ativo),
    meios_pagamento: normalizarMeiosPagamento(bruto),
  };
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
  const [chaveCredito, setChaveCredito] = useState('');
  const [creditoValidado, setCreditoValidado] = useState<{ chave: string; valorDisponivel: number } | null>(null);
  const [validandoCredito, setValidandoCredito] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [carrinho, setCarrinho] = useState<{ [key: number]: number }>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(CARRINHO_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [verCarrinho, setVerCarrinho] = useState(false);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');
  const [usarDadosCadastroPagador, setUsarDadosCadastroPagador] = useState(true);
  const [nomePagador, setNomePagador] = useState('');
  const [telefonePagador, setTelefonePagador] = useState('');
  const [cpfPagador, setCpfPagador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [metodoPagamento, setMetodoPagamento] = useState<'pix' | 'cielo' | 'mercado_pago'>('pix');
  const [tipoCartaoCielo, setTipoCartaoCielo] = useState<'credito' | 'debito' | 'alelo'>('credito');
  const [numeroVoucher, setNumeroVoucher] = useState('');
  const [nomeVoucher, setNomeVoucher] = useState('');
  const [validadeVoucher, setValidadeVoucher] = useState('');
  const [cvvVoucher, setCvvVoucher] = useState('');
  const [cieloDisponivel, setCieloDisponivel] = useState(false);
  const [pixGerado, setPixGerado] = useState<{ qrCode: string; qrCodeBase64?: string; ticketUrl?: string } | null>(null);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState('todos');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lojaConfig, setLojaConfig] = useState(LOJA_CONFIG_PADRAO);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const isRecovery = hashParams.get('type') === 'recovery' || Boolean(hashParams.get('access_token') && hashParams.get('refresh_token'));
    const isRecoveryError = Boolean(hashParams.get('error') || hashParams.get('error_code'));

    if (isRecovery || isRecoveryError) {
      window.location.replace(`/login${window.location.hash}`);
    }
  }, []);

  const adicionarToast = useCallback((texto: string, tipo: Toast['tipo'] = 'info') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, texto, tipo }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    localStorage.setItem(CARRINHO_STORAGE_KEY, JSON.stringify(carrinho));
  }, [carrinho]);

  useEffect(() => {
    fetch('/api/cielo/sop-token', { cache: 'no-store' })
      .then(resposta => resposta.ok ? resposta.json() : { enabled: false })
      .then(config => setCieloDisponivel(Boolean(config.enabled)))
      .catch(() => setCieloDisponivel(false));
  }, []);

  useEffect(() => {
    const meios = lojaConfig.meios_pagamento;
    if (meios[metodoPagamento] && (metodoPagamento !== 'cielo' || cieloDisponivel)) return;
    if (meios.pix) setMetodoPagamento('pix');
    else if (meios.cielo && cieloDisponivel) setMetodoPagamento('cielo');
    else if (meios.mercado_pago) setMetodoPagamento('mercado_pago');
  }, [cieloDisponivel, lojaConfig.meios_pagamento, metodoPagamento]);

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

  const carregarLojaConfig = useCallback(async () => {
    const { data, error } = await supabase
      .from('app_config')
      .select('valor')
      .eq('chave', 'loja_config')
      .maybeSingle();

    if (!error && data?.valor) {
      setLojaConfig(normalizarLojaConfig(data.valor));
    }
  }, []);

  useEffect(() => {
    if (verCarrinho) carregarLojaConfig();
  }, [verCarrinho, carregarLojaConfig]);

  useEffect(() => {
    async function init() {
      setCarregando(true);
      setErroCarga(null);

      try {
        const [produtosRes, canaisRes, configRes] = await Promise.all([
          supabase
            .from('produtos')
            .select('*')
            .eq('ativo', true)
            .order('categoria', { ascending: true }),
          supabase
            .from('canais_loja')
            .select('nome_rede,endereco')
            .eq('ativo', true)
            .order('nome_rede', { ascending: true }),
          supabase
            .from('app_config')
            .select('valor')
            .eq('chave', 'loja_config')
            .maybeSingle(),
        ]);

        if (produtosRes.error) throw new Error(produtosRes.error.message);
        setProdutos(produtosRes.data ?? []);
        if (!canaisRes.error) setCanais((canaisRes.data ?? []) as CanalLoja[]);
        if (!configRes.error && configRes.data?.valor) setLojaConfig(normalizarLojaConfig(configRes.data.valor));
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

        await Promise.all([carregarCupons(user.id), carregarLojaConfig()]);
      } catch (err) {
        console.error('[Loja] Erro ao carregar perfil:', err);
      }
    }

    init();
  }, [carregarCupons, carregarLojaConfig]);

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
  const descontoDiaDPercentual = lojaConfig.cupom_dia_d_ativo ? Number(lojaConfig.cupom_dia_d_percentual || 0) : 0;
  const descontoPercentual = Math.max(descontoCupomPercentual, descontoAutomaticoPercentual, descontoDiaDPercentual);
  const descontoValor = subtotalProdutos * (descontoPercentual / 100);
  const valorFrete = subtotalProdutos > 0 && subtotalProdutos < LIMITE_FRETE_GRATIS ? lojaConfig.taxa_entrega_padrao : 0;
  const totalPedidoFinal = Math.max(subtotalProdutos - descontoValor + valorFrete, 0);
  const creditoPrevisto = Math.min(Number(creditoValidado?.valorDisponivel || 0), totalPedidoFinal);
  const totalAposCredito = Math.max(totalPedidoFinal - creditoPrevisto, 0);
  const totalItens = Object.values(carrinho).reduce((a, b) => a + b, 0);
  const mensagensPromocionais = useMemo(() => {
    const mensagens = [
      '🚚 Prazo de entrega: 24hs (amanhã).',
      `💸 Ganhe ${DESCONTO_AUTOMATICO_PERCENTUAL}% de desconto em compras acima de ${formatarMoedaBR(LIMITE_DESCONTO_AUTOMATICO)}.`,
      `📦 Frete Grátis nas compras acima de ${formatarMoedaBR(LIMITE_FRETE_GRATIS)}.`,
    ];

    if (lojaConfig.cupom_dia_d_ativo && lojaConfig.cupom_dia_d_percentual > 0) {
      mensagens.push(`Dia D: ${formatarNumeroBR(lojaConfig.cupom_dia_d_percentual, 0)}% de desconto ativo hoje.`);
    }

    cupons.forEach(cupom => {
      mensagens.push(`🎟️ Você tem ${formatarNumeroBR(cupom.percentual_desconto, 0)}% em cupom de desconto. APROVEITE!!!`);
    });

    return mensagens;
  }, [cupons, lojaConfig]);

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
    if (!nomePagador) setNomePagador(nomePerfil);
    if (!telefonePagador) setTelefonePagador(telefonePerfil);

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
      adicionarToast('Este produto esta temporariamente sem estoque.', 'erro');
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

  const carregarScriptCielo = (ambiente: 'sandbox' | 'production') => new Promise<void>((resolve, reject) => {
    if (window.bpSop_silentOrderPost) {
      resolve();
      return;
    }

    const id = 'cielo-silent-order-post';
    const existente = document.getElementById(id) as HTMLScriptElement | null;
    if (existente) {
      existente.addEventListener('load', () => resolve(), { once: true });
      existente.addEventListener('error', () => reject(new Error('Falha ao carregar a proteção Cielo.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.async = true;
    script.src = ambiente === 'production'
      ? 'https://transactionscus.pagador.com.br/post/Scripts/silentorderpost-1.0.min.js'
      : 'https://transactionsandbox.pagador.com.br/post/Scripts/silentorderpost-1.0.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar a proteção Cielo.'));
    document.body.appendChild(script);
  });

  const autenticarDebito3DS = async (accessTokenSupabase: string, pedidoId: string | number, valor: number) => {
    const tokenHttp = await fetch('/api/cielo/3ds-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessTokenSupabase}` },
      cache: 'no-store',
    });
    const config = await tokenHttp.json();
    if (!tokenHttp.ok || !config.accessToken) throw new Error(config.error || 'Não foi possível iniciar o 3DS.');

    const definirValor = (seletor: string, valorCampo: string) => {
      const campo = document.querySelector<HTMLInputElement>(seletor);
      if (campo) campo.value = valorCampo;
    };
    definirValor('.bpmpi_accesstoken', config.accessToken);
    definirValor('.bpmpi_ordernumber', String(pedidoId));
    definirValor('.bpmpi_totalamount', String(Math.round(valor * 100)));

    return new Promise<Record<string, string | undefined>>((resolve, reject) => {
      window.bpmpi_config = () => ({
        onReady: () => window.bpmpi_authenticate?.(),
        onSuccess: (resultado: Record<string, string | undefined>) => resolve(resultado),
        onFailure: () => reject(new Error('Não foi possível autenticar o cartão de débito.')),
        onUnenrolled: () => reject(new Error('Este cartão não está habilitado para autenticação 3DS.')),
        onDisabled: () => reject(new Error('A autenticação 3DS está desabilitada.')),
        onError: (resultado: Record<string, string | undefined>) => reject(new Error(resultado.ReturnMessage || 'Falha na autenticação 3DS.')),
        onUnsupportedBrand: () => reject(new Error('A bandeira deste cartão não oferece autenticação 3DS.')),
        Environment: config.environment,
        Debug: false,
      });

      const id = 'cielo-3ds-script';
      document.getElementById(id)?.remove();
      const script = document.createElement('script');
      script.id = id;
      script.async = true;
      script.src = config.environment === 'PRD'
        ? 'https://mpi.braspag.com.br/Scripts/BP.Mpi.3ds20.min.js'
        : 'https://mpisandbox.braspag.com.br/Scripts/BP.Mpi.3ds20.min.js';
      script.onerror = () => reject(new Error('Não foi possível carregar a autenticação 3DS.'));
      document.body.appendChild(script);
    });
  };

  const tokenizarCartaoCielo = async (accessTokenSupabase: string) => {
    const respostaToken = await fetch('/api/cielo/sop-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessTokenSupabase}` },
      cache: 'no-store',
    });
    const tokenConfig = await respostaToken.json();
    if (!respostaToken.ok || !tokenConfig.accessToken) {
      throw new Error(tokenConfig.error || 'Não foi possível iniciar o pagamento protegido.');
    }

    await carregarScriptCielo(tokenConfig.environment === 'production' ? 'production' : 'sandbox');
    if (!window.bpSop_silentOrderPost) throw new Error('Proteção de cartão Cielo indisponível.');

    return new Promise<{ paymentToken: string; brand?: string }>((resolve, reject) => {
      window.bpSop_silentOrderPost?.({
        accessToken: tokenConfig.accessToken,
        environment: tokenConfig.environment,
        language: 'PT',
        enableBinQuery: false,
        enableVerifyCard: false,
        enableTokenize: false,
        cvvrequired: true,
        cardType: tipoCartaoCielo === 'credito' ? 'creditCard' : 'debitCard',
        onSuccess: (response: { PaymentToken?: string; Brand?: string }) => {
          if (response.PaymentToken) resolve({ paymentToken: response.PaymentToken, brand: response.Brand });
          else reject(new Error('A Cielo não retornou o token seguro do cartão.'));
        },
        onError: () => reject(new Error('A Cielo não conseguiu proteger os dados do cartão.')),
        onInvalid: () => reject(new Error('Confira os dados do cartão.')),
      });
    });
  };

  const validarChaveCredito = async () => {
    if (!chaveCredito.trim()) {
      adicionarToast('Informe a chave de crédito.', 'erro');
      return;
    }
    setValidandoCredito(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Entre na sua conta para validar a chave.');
      const resposta = await fetch('/api/creditos/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ chave: chaveCredito }),
      });
      const resultado = await resposta.json();
      if (!resposta.ok) throw new Error(resultado.error || 'Chave de crédito inválida.');
      setChaveCredito(resultado.chave);
      setCreditoValidado({ chave: resultado.chave, valorDisponivel: Number(resultado.valorDisponivel || 0) });
      adicionarToast(`Crédito disponível: ${formatarMoedaBR(resultado.valorDisponivel)}.`, 'sucesso');
    } catch (err: any) {
      setCreditoValidado(null);
      adicionarToast(err.message || 'Não foi possível validar a chave.', 'erro');
    } finally {
      setValidandoCredito(false);
    }
  };

  const liberarCreditoPedido = async (pedidoId: string | number, accessToken: string) => {
    await fetch('/api/creditos/liberar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ pedidoId }),
    }).catch(() => undefined);
  };

  const finalizarPedido = async (e: React.FormEvent) => {
    e.preventDefault();

    if (totalItens === 0) {
      adicionarToast('Adicione itens ao carrinho!', 'erro');
      return;
    }

    setEnviando(true);
    let pedidoIdCriado: string | number | null = null;
    let creditoReservado = false;
    let pagamentoIniciado = false;
    let accessTokenAtual = '';

    try {
      const { data: { session }, error: errSession } = await supabase.auth.getSession();
      const user = session?.user;
      if (errSession || !session || !user) {
        adicionarToast('Voce precisa estar logado para finalizar o pedido!', 'erro');
        setEnviando(false);
        return;
      }
      accessTokenAtual = session.access_token;

      if (totalAposCredito > 0 && !lojaConfig.meios_pagamento[metodoPagamento]) {
        throw new Error('Este meio de pagamento esta temporariamente indisponivel.');
      }

      const cadastroPedido = await validarCadastroPedido(user.id);
      const cpfPagadorDigitos = somenteDigitos(cpfPagador);
      if (totalAposCredito > 0 && (metodoPagamento === 'cielo' || metodoPagamento === 'mercado_pago') && cpfPagadorDigitos.length !== 11) {
        adicionarToast('Informe o CPF do pagador com 11 digitos para pagamento com cartao.', 'erro');
        throw new Error('CPF do pagador invalido.');
      }

      if (totalAposCredito > 0 && metodoPagamento === 'cielo') {
        if (somenteDigitos(numeroVoucher).length < 13 || somenteDigitos(cvvVoucher).length < 3 || !nomeVoucher.trim() || somenteDigitos(validadeVoucher).length !== 6) {
          throw new Error('Preencha corretamente todos os dados do cartão de benefício.');
        }
      }

      const dadosPagador = {
        nome: usarDadosCadastroPagador ? cadastroPedido.nome : (nomePagador || cadastroPedido.nome),
        telefone: usarDadosCadastroPagador ? cadastroPedido.telefone : (telefonePagador || cadastroPedido.telefone),
      };
      const estoqueAtualizado = await revalidarEstoqueCarrinho();
      const produtosParaPedido = estoqueAtualizado.length > 0 ? estoqueAtualizado : produtos;

      const listaItens = Object.entries(carrinho).map(([id, qtd]) => {
        const produto = produtosParaPedido.find(prod => prod.id === Number(id));
        return {
          id: Number(id),
          nome: produto?.nome ?? 'Produto',
          descricao: produto?.descricao ?? '',
          imagem_url: produto?.imagem_url ?? '',
          preco: produto?.preco ?? 0,
          quantidade: qtd,
          subtotal: (produto?.preco ?? 0) * qtd,
        };
      });

      const subtotalValidado = listaItens.reduce((total, item) => total + item.subtotal, 0);
      const freteValidado = subtotalValidado > 0 && subtotalValidado < LIMITE_FRETE_GRATIS ? lojaConfig.taxa_entrega_padrao : 0;
      const descontoAutomaticoValidado = subtotalValidado >= LIMITE_DESCONTO_AUTOMATICO ? DESCONTO_AUTOMATICO_PERCENTUAL : 0;
      const descontoCupomValidado = cupomSelecionado ? Number(cupomSelecionado.percentual_desconto) : 0;
      const descontoDiaDValidado = lojaConfig.cupom_dia_d_ativo ? Number(lojaConfig.cupom_dia_d_percentual || 0) : 0;
      const descontoPercentualValidado = Math.max(descontoAutomaticoValidado, descontoCupomValidado, descontoDiaDValidado);
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
      if (!pedidoCriado?.id) throw new Error('O banco não retornou o identificador do pedido.');
      pedidoIdCriado = pedidoCriado.id;

      if (creditoValidado) {
        const respostaCredito = await fetch('/api/creditos/aplicar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ pedidoId: pedidoCriado.id, chave: creditoValidado.chave }),
        });
        const credito = await respostaCredito.json();
        if (!respostaCredito.ok) throw new Error(credito.error || 'Não foi possível aplicar a chave de crédito.');

        if (credito.quitado) {
          setCarrinho({});
          setVerCarrinho(false);
          setCupomSelecionadoId('');
          setChaveCredito('');
          setCreditoValidado(null);
          adicionarToast('Pedido pago integralmente com a chave de crédito!', 'sucesso');
          router.push('/pedidos?pagamento=sucesso');
          return;
        }
        creditoReservado = Number(credito.valor_aplicado || 0) > 0;
        if ((metodoPagamento === 'cielo' || metodoPagamento === 'mercado_pago') && cpfPagadorDigitos.length !== 11) {
          throw new Error('Informe o CPF do pagador para pagar o saldo restante.');
        }
      }

      const autenticacao3DS = metodoPagamento === 'cielo' && tipoCartaoCielo === 'debito'
        ? await autenticarDebito3DS(session.access_token, pedidoCriado.id, valorTotal)
        : undefined;
      const tokenCielo = metodoPagamento === 'cielo'
        ? await tokenizarCartaoCielo(session.access_token)
        : undefined;

      const endpointPagamento = metodoPagamento === 'pix'
        ? '/api/mercadopago/pix'
        : metodoPagamento === 'cielo'
          ? '/api/cielo/payment'
          : '/api/mercadopago/preference';
      const respostaPagamento = await fetch(endpointPagamento, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pedidoId: pedidoCriado?.id,
          itens: listaItens,
          payer: {
            nome: dadosPagador.nome,
            telefone: dadosPagador.telefone,
            email: user.email,
            cpf: cpfPagadorDigitos || undefined,
            endereco: cadastroPedido.endereco,
            regiao: cadastroPedido.regiao,
          },
          ...(metodoPagamento === 'cielo' ? {
            tipo: tipoCartaoCielo,
            paymentToken: tokenCielo?.paymentToken,
            brand: tokenCielo?.brand,
            browserFingerprint: tipoCartaoCielo === 'credito' ? `${user.id}-${pedidoCriado.id}` : undefined,
            externalAuthentication: autenticacao3DS,
          } : {}),
        }),
      });

      const pagamento = await respostaPagamento.json();
      if (!respostaPagamento.ok) throw new Error(pagamento.error || 'Erro ao iniciar pagamento.');
      pagamentoIniciado = true;

      if (metodoPagamento === 'pix') {
        setPixGerado({
          qrCode: pagamento.qrCode,
          qrCodeBase64: pagamento.qrCodeBase64,
          ticketUrl: pagamento.ticketUrl,
        });
        setCarrinho({});
        setVerCarrinho(false);
        setCupomSelecionadoId('');
        setChaveCredito('');
        setCreditoValidado(null);
        adicionarToast('Pix gerado. Copie o codigo para pagar.', 'sucesso');
        return;
      }

      if (metodoPagamento === 'cielo') {
        setCarrinho({});
        setVerCarrinho(false);
        setCupomSelecionadoId('');
        setChaveCredito('');
        setCreditoValidado(null);
        setNumeroVoucher('');
        setNomeVoucher('');
        setValidadeVoucher('');
        setCvvVoucher('');
        adicionarToast('Pagamento Cielo aprovado. Pedido enviado para preparo!', 'sucesso');
        router.push('/pedidos?pagamento=sucesso');
        return;
      }

      const checkoutUrl = pagamento.initPoint || pagamento.sandboxInitPoint;
      if (!checkoutUrl) throw new Error('Mercado Pago nao retornou a URL de pagamento.');

      setCarrinho({});
      setVerCarrinho(false);
      setCupomSelecionadoId('');
      setChaveCredito('');
      setCreditoValidado(null);
      adicionarToast('Pedido registrado. Redirecionando para pagamento...', 'sucesso');
      window.location.href = checkoutUrl;
    } catch (err: any) {
      console.error('[Pedido] Falha:', err);
      if (pedidoIdCriado && creditoReservado && !pagamentoIniciado && accessTokenAtual) {
        await liberarCreditoPedido(pedidoIdCriado, accessTokenAtual);
      }
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
    <div className="relative mx-auto min-h-screen max-w-md bg-gray-50 pb-24 font-sans shadow-2xl md:max-w-6xl">
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

      <header className="border-b border-gray-100 bg-white p-4 shadow-sm md:sticky md:top-0 md:z-30 md:px-6 md:py-3">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="flex-1 md:max-w-[220px]">
            <Logo />
          </div>
          <Link href="/perfil" className="p-1 text-gray-400 hover:text-viva-roxo md:hidden" aria-label="Abrir perfil">
            <span className="text-xl">&#128100;</span>
          </Link>
        </div>
        {categorias.length > 0 && (
          <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:mt-3 md:pb-0">
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

      <main className="space-y-4 p-4 md:p-6">
        <Link href="/dieta" className="block rounded-2xl bg-gradient-to-r from-viva-roxo to-gray-900 p-4 text-white shadow-sm">
          <p className="text-xs font-black uppercase tracking-wider text-viva-verde">Novidade</p>
          <p className="mt-1 text-sm font-black">Gere sua dieta personalizada gratuita e descubra exatamente quais marmitas comprar.</p>
          <p className="mt-2 text-xs font-bold text-white/75">Clique aqui e crie seu Plano Nutri.</p>
        </Link>

        <div className="viva-marquee-wrap flex overflow-hidden rounded-2xl border border-viva-verde/40 bg-viva-verde/20 py-3 text-xs font-black text-viva-roxo">
          {[0, 1].map(copia => (
            <div
              key={copia}
              aria-hidden={copia === 1}
              className="viva-marquee flex min-w-max items-center whitespace-nowrap px-4"
            >
              {mensagensPromocionais.map((mensagem, index) => (
                <span key={`${copia}-${mensagem}-${index}`} className="mx-4 inline-flex items-center gap-4">
                  <span>{mensagem}</span>
                  <span className="text-viva-roxo/50">✨</span>
                </span>
              ))}
            </div>
          ))}
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
            <p className="font-semibold">Nenhum produto ativo no momento.</p>
          </div>
        ) : (
          categoriasVisiveis.map(cat => (
            <div key={cat || 'sem-categoria'}>
              <h3 className="mb-2 mt-3 text-xs font-bold uppercase tracking-widest text-gray-400">{cat || 'Outros'}</h3>
              <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 lg:grid-cols-3">
                {produtos.filter(p => p.categoria === cat).map(item => {
                  return (
                  <div key={item.id} className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                    {Number(item.estoque || 0) <= 0 && (
                      <span className="absolute right-3 top-3 z-10 rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-black tracking-wider text-white shadow-sm">
                        ESGOTADO
                      </span>
                    )}
                    <Link href={`/produto/${item.id}`} className="flex w-full gap-4 p-4 text-left transition hover:bg-gray-50">
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
                        <span className="text-xs font-black text-viva-roxo">Ver detalhes</span>
                      </div>
                    </div>
                    </Link>

                    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                      <p className="text-xs font-semibold text-gray-400">Detalhes em tela propria</p>
                      {carrinho[item.id] ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => removerDoCarrinho(item.id)} className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600 transition active:scale-90">-</button>
                          <span className="w-4 text-center text-sm font-bold text-gray-800">{carrinho[item.id]}</span>
                          <button onClick={() => adicionarAoCarrinho(item.id)} disabled={carrinho[item.id] >= Number(item.estoque || 0)} className="flex h-7 w-7 items-center justify-center rounded-full bg-viva-verde text-sm font-bold text-viva-roxo transition active:scale-90 disabled:opacity-40">+</button>
                        </div>
                      ) : (
                        <button onClick={() => adicionarAoCarrinho(item.id)} aria-disabled={Number(item.estoque || 0) <= 0} className={`rounded-full px-3 py-1.5 text-xs font-bold shadow-sm transition-transform active:scale-95 ${Number(item.estoque || 0) <= 0 ? 'bg-gray-200 text-gray-500' : 'bg-viva-verde text-viva-roxo'}`}>
                          {Number(item.estoque || 0) <= 0 ? 'Esgotado' : '+ Adicionar'}
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

      <StoreFooter />

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

                  <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                    <label className="mb-1 block text-xs font-bold text-green-900">Chave de Crédito</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chaveCredito}
                        onChange={e => {
                          setChaveCredito(e.target.value.toUpperCase());
                          setCreditoValidado(null);
                        }}
                        placeholder="Ex.: VL-ABC123-DEF456"
                        className="min-w-0 flex-1 rounded-lg border border-green-200 bg-white p-2 text-sm font-bold uppercase text-gray-900"
                      />
                      <button type="button" disabled={validandoCredito} onClick={validarChaveCredito} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                        {validandoCredito ? 'Validando...' : 'Aplicar'}
                      </button>
                    </div>
                    {creditoValidado && (
                      <div className="mt-2 flex items-center justify-between text-xs font-bold text-green-800">
                        <span>Saldo disponível: {formatarMoedaBR(creditoValidado.valorDisponivel)}</span>
                        <button type="button" onClick={() => { setChaveCredito(''); setCreditoValidado(null); }} className="underline">Remover</button>
                      </div>
                    )}
                  </div>

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
                    {creditoPrevisto > 0 && (
                      <div className="flex justify-between font-bold text-green-700">
                        <span>Chave de crédito</span>
                        <span>- {formatarMoedaBR(creditoPrevisto)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 text-lg font-extrabold text-gray-800">
                      <span>Total a pagar:</span>
                      <span className="text-viva-roxo">{formatarMoedaBR(totalAposCredito)}</span>
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

                  {totalAposCredito > 0 && (lojaConfig.meios_pagamento.pix || (lojaConfig.meios_pagamento.cielo && cieloDisponivel) || lojaConfig.meios_pagamento.mercado_pago) && <div>
                    <label className="mb-2 block text-xs font-bold text-gray-600">Meio de pagamento</label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {lojaConfig.meios_pagamento.pix && <button type="button" onClick={() => setMetodoPagamento('pix')} className={`rounded-xl border px-3 py-2.5 text-xs font-black ${metodoPagamento === 'pix' ? 'border-green-600 bg-green-600 text-white' : 'border-green-200 bg-green-50 text-green-800'}`}>
                        <span className="block">Pix</span>
                        <span className="mt-1 inline-block rounded-full bg-white/90 px-2 py-0.5 text-[9px] font-black text-green-700">Aprovação imediata</span>
                      </button>}
                      {lojaConfig.meios_pagamento.cielo && cieloDisponivel && (
                        <button type="button" onClick={() => setMetodoPagamento('cielo')} className={`rounded-xl border px-3 py-2.5 text-xs font-black ${metodoPagamento === 'cielo' ? 'border-viva-roxo bg-viva-roxo text-white' : 'border-gray-200 bg-white text-gray-600'}`}>
                          <span className="block">Cartão de Crédito, Débito ou Alelo</span>
                          <span className="mt-2 flex items-center justify-center gap-1" aria-label="Bandeiras Visa, Mastercard, Elo e Alelo">
                            <span className="flex h-4 min-w-8 items-center justify-center rounded-sm bg-white px-1 text-[7px] font-black italic text-[#1434CB] shadow-sm">VISA</span>
                            <span className="flex h-4 min-w-8 items-center justify-center rounded-sm bg-white px-1 shadow-sm" title="Mastercard">
                              <span className="h-2.5 w-2.5 rounded-full bg-[#EB001B]" />
                              <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-[#F79E1B] opacity-90" />
                            </span>
                            <span className="flex h-4 min-w-8 items-center justify-center rounded-sm bg-[#111827] px-1 text-[7px] font-black lowercase text-[#FFCB05] shadow-sm">elo</span>
                            <span className="flex h-4 min-w-8 items-center justify-center rounded-sm bg-[#00A859] px-1 text-[7px] font-black lowercase text-white shadow-sm">alelo</span>
                          </span>
                        </button>
                      )}
                      {lojaConfig.meios_pagamento.mercado_pago && <button type="button" onClick={() => setMetodoPagamento('mercado_pago')} className={`rounded-xl border px-3 py-2.5 text-xs font-black ${metodoPagamento === 'mercado_pago' ? 'border-[#009EE3] bg-[#009EE3] text-white' : 'border-sky-200 bg-white text-[#007EB5]'}`}>
                        Pagar com Mercado Pago
                      </button>}
                    </div>
                  </div>}

                  {totalAposCredito > 0 && !lojaConfig.meios_pagamento.pix && !(lojaConfig.meios_pagamento.cielo && cieloDisponivel) && !lojaConfig.meios_pagamento.mercado_pago && (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                      Nenhum meio de pagamento esta disponivel no momento.
                    </p>
                  )}

                  {totalAposCredito > 0 && metodoPagamento === 'pix' && lojaConfig.meios_pagamento.pix && (
                    <div className="rounded-2xl border border-green-200 bg-green-50 p-4" role="status">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#32BCAD] text-xs font-black text-white">PIX</span>
                        <div>
                          <p className="text-sm font-black text-green-900">Pix selecionado</p>
                          <p className="mt-1 text-xs leading-relaxed text-green-800">
                            Ao confirmar o pedido, o QR Code e o código Pix Copia e Cola serão gerados pelo Mercado Pago.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {totalAposCredito > 0 && (metodoPagamento === 'cielo' || metodoPagamento === 'mercado_pago') && (
                    <div className="rounded-2xl border border-purple-100 bg-purple-50 p-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-viva-roxo">
                        <input
                          type="checkbox"
                          checked={usarDadosCadastroPagador}
                          onChange={e => setUsarDadosCadastroPagador(e.target.checked)}
                          className="h-4 w-4 rounded border-purple-200 text-viva-roxo"
                        />
                        Usar dados do cadastro para o pagador
                      </label>

                      {!usarDadosCadastroPagador && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-bold text-gray-600">Nome do pagador</label>
                            <input type="text" value={nomePagador} onChange={e => setNomePagador(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-sm text-gray-900" />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-bold text-gray-600">WhatsApp do pagador</label>
                            <input type="tel" value={telefonePagador} onChange={e => setTelefonePagador(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-sm text-gray-900" />
                          </div>
                        </div>
                      )}

                      <div className="mt-3">
                        <label className="mb-1 block text-xs font-bold text-gray-600">CPF do pagador *</label>
                        <input
                          required={metodoPagamento === 'cielo' || metodoPagamento === 'mercado_pago'}
                          inputMode="numeric"
                          maxLength={14}
                          value={cpfPagador}
                          onChange={e => setCpfPagador(e.target.value)}
                          placeholder="Somente numeros"
                          className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-sm text-gray-900"
                        />
                      </div>
                    </div>
                  )}

                  {totalAposCredito > 0 && metodoPagamento === 'cielo' && (
                    <div className="space-y-3 rounded-2xl border border-green-200 bg-green-50 p-3">
                      <div>
                        <p className="text-sm font-black text-green-900">Pagamento seguro Cielo</p>
                        <p className="text-xs text-green-800">Crédito e débito à vista ou Alelo. Sem parcelamento.</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {([['credito', 'Crédito'], ['debito', 'Débito'], ['alelo', 'Alelo']] as const).map(([codigo, rotulo]) => (
                          <button key={codigo} type="button" onClick={() => setTipoCartaoCielo(codigo)} className={`rounded-lg border px-2 py-2 text-xs font-black ${tipoCartaoCielo === codigo ? 'border-green-700 bg-green-700 text-white' : 'border-green-200 bg-white text-green-800'}`}>
                            {rotulo}
                          </button>
                        ))}
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-gray-600">Número do cartão *</label>
                        <input
                          required
                          type="text"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          maxLength={23}
                          value={numeroVoucher}
                          onChange={e => {
                            const digitos = somenteDigitos(e.target.value).slice(0, 19);
                            setNumeroVoucher(digitos.replace(/(.{4})/g, '$1 ').trim());
                          }}
                          placeholder="0000 0000 0000 0000"
                          className="bp-sop-cardnumber bpmpi_cardnumber w-full rounded-xl border border-green-200 bg-white p-2.5 text-sm text-gray-900"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-bold text-gray-600">Nome impresso no cartão *</label>
                        <input
                          required
                          type="text"
                          autoComplete="cc-name"
                          maxLength={25}
                          value={nomeVoucher}
                          onChange={e => setNomeVoucher(e.target.value.toUpperCase())}
                          className="bp-sop-cardholdername w-full rounded-xl border border-green-200 bg-white p-2.5 text-sm uppercase text-gray-900"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-bold text-gray-600">Validade *</label>
                          <input
                            required
                            type="text"
                            inputMode="numeric"
                            autoComplete="cc-exp"
                            maxLength={7}
                            value={validadeVoucher}
                            onChange={e => {
                              const digitos = somenteDigitos(e.target.value).slice(0, 6);
                              setValidadeVoucher(digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos);
                            }}
                            placeholder="MM/AAAA"
                            className="bp-sop-cardexpirationdate w-full rounded-xl border border-green-200 bg-white p-2.5 text-sm text-gray-900"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-bold text-gray-600">CVV *</label>
                          <input
                            required
                            type="password"
                            inputMode="numeric"
                            autoComplete="cc-csc"
                            maxLength={4}
                            value={cvvVoucher}
                            onChange={e => setCvvVoucher(somenteDigitos(e.target.value).slice(0, 4))}
                            className="bp-sop-cardcvvc w-full rounded-xl border border-green-200 bg-white p-2.5 text-sm text-gray-900"
                          />
                        </div>
                      </div>
                      <input type="hidden" value={tipoCartaoCielo === 'credito' ? 'creditCard' : 'debitCard'} readOnly className="bp-sop-cardtype" />
                      {tipoCartaoCielo === 'debito' && (
                        <div className="hidden" aria-hidden="true">
                          <input readOnly className="bpmpi_auth" value="true" />
                          <input readOnly className="bpmpi_auth_notifyonly" value="false" />
                          <input readOnly className="bpmpi_accesstoken" value="" />
                          <input readOnly className="bpmpi_ordernumber" value="" />
                          <input readOnly className="bpmpi_currency" value="986" />
                          <input readOnly className="bpmpi_totalamount" value="" />
                          <input readOnly className="bpmpi_installments" value="1" />
                          <input readOnly className="bpmpi_paymentmethod" value="debit" />
                          <input readOnly className="bpmpi_cardexpirationmonth" value={somenteDigitos(validadeVoucher).slice(0, 2)} />
                          <input readOnly className="bpmpi_cardexpirationyear" value={somenteDigitos(validadeVoucher).slice(2, 6)} />
                          <input readOnly className="bpmpi_merchant_url" value="https://www.vivalevedf.com.br" />
                          <input readOnly className="bpmpi_billto_contactname" value={nomePagador || nome} />
                          <input readOnly className="bpmpi_billto_email" value="" />
                        </div>
                      )}
                      <p className="text-[11px] font-semibold text-green-800">Dados protegidos pela Cielo. A bandeira precisa estar habilitada no estabelecimento.</p>
                    </div>
                  )}

                  <button type="submit" disabled={enviando} className="w-full rounded-xl bg-viva-roxo py-3.5 text-center font-bold text-white shadow-lg transition-all active:scale-[0.99] disabled:opacity-60">
                    {enviando
                      ? (metodoPagamento === 'pix' ? 'Gerando Pix...' : 'Processando...')
                      : (metodoPagamento === 'pix' ? 'Confirmar Pedido e Gerar Pix' : 'Confirmar Pedido')}
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
        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-white">
          <img src="/nav-icons/sacola.png" alt="" className="h-full w-full object-contain" aria-hidden="true" />
        </span>
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
          className="fixed bottom-24 left-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-viva-roxo to-orange-400 text-white shadow-xl ring-4 ring-white transition active:scale-95 md:hidden"
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
          className="fixed bottom-24 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg ring-4 ring-white transition hover:scale-110 active:scale-95 md:hidden"
        >
          <CanalIcone nome={whatsapp.nome_rede} />
        </a>
      )}

      <BottomNav active="loja" />
    </div>
  );
}
