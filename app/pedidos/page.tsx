"use client";

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../supabase';
import { nomeMeioPagamento } from '../../lib/meiosPagamento';
import Logo from '../../components/Logo';
import BottomNav from '../../components/BottomNav';

interface ItemPedido {
  id: number;
  nome: string;
  preco: number;
  quantidade: number;
  subtotal?: number;
}

interface Pedido {
  id: string;
  endereco_entrega: string;
  endereco?: string;
  valor_total: number;
  total?: number;
  status: string;
  pagamento_status?: string | null;
  mercado_pago_status_detail?: string | null;
  meio_pagamento?: string | null;
  cielo_return_code?: string | null;
  cielo_return_message?: string | null;
  itens: ItemPedido[];
  criado_em?: string;
  created_at?: string;
  updated_at?: string;
  entregador_id?: string | null;
  saiu_entrega_em?: string | null;
  entregue_em?: string | null;
  entrega_metodo_confirmacao?: string | null;
  entrega_janela?: string | null;
}

const ETAPAS_STATUS = [
  { key: 'Pendente', label: 'Pedido enviado' },
  { key: 'Recebido', label: 'Recebido' },
  { key: 'Em Preparo', label: 'Em preparo' },
  { key: 'Saiu para Entrega', label: 'Saiu para entrega' },
  { key: 'Entregue', label: 'Entregue' },
];

function normalizarStatus(status: string) {
  if (status === 'Aguardando Pagamento') return 'Pendente';
  if (status === 'Em Rota') return 'Saiu para Entrega';
  if (['Concluído', 'Concluido', 'Conclu¡do'].includes(status)) return 'Entregue';
  return status;
}

function getStatusIndex(status: string): number {
  const idx = ETAPAS_STATUS.findIndex(etapa => etapa.key === normalizarStatus(status));
  return idx === -1 ? 0 : idx;
}

function badgeStatus(status: string) {
  const cores: Record<string, string> = {
    'Pendente': 'bg-gray-100 text-gray-600',
    'Aguardando Pagamento': 'bg-orange-100 text-orange-700',
    'Recebido': 'bg-blue-100 text-blue-700',
    'Em Preparo': 'bg-yellow-100 text-yellow-700',
    'Em Rota': 'bg-blue-100 text-blue-700',
    'Saiu para Entrega': 'bg-purple-100 text-purple-700',
    'Concluído': 'bg-green-100 text-green-700',
    'Concluido': 'bg-green-100 text-green-700',
    'Conclu¡do': 'bg-green-100 text-green-700',
    'Entregue': 'bg-green-100 text-green-700',
    'Pagamento Recusado': 'bg-red-100 text-red-700',
    'Cancelado': 'bg-red-100 text-red-700',
  };
  return cores[status] ?? 'bg-gray-100 text-gray-600';
}

function formatarMoedaBR(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatarData(iso?: string) {
  if (!iso) return 'Data não informada';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function totalPedido(pedido: Pedido) {
  return Number(pedido.valor_total ?? pedido.total ?? 0);
}

function enderecoPedido(pedido: Pedido) {
  return pedido.endereco_entrega || pedido.endereco || 'Endereço não informado';
}

function dataReferenciaPedido(pedido: Pedido) {
  return pedido.updated_at ?? pedido.criado_em ?? pedido.created_at;
}

function entregueHaMaisDe24h(pedido: Pedido) {
  if (normalizarStatus(pedido.status) !== 'Entregue') return false;
  const data = dataReferenciaPedido(pedido);
  if (!data) return false;
  return Date.now() - new Date(data).getTime() > 24 * 60 * 60 * 1000;
}

function limiteHistoricoISO() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function LinhaDoTempo({ status }: { status: string }) {
  if (status === 'Cancelado') {
    return (
      <div className="flex items-center gap-2 py-2">
        <span className="text-red-500 text-lg">!</span>
        <span className="text-sm font-semibold text-red-500">Pedido cancelado</span>
      </div>
    );
  }

  const indiceAtual = getStatusIndex(status);

  return (
    <div className="mt-3 flex w-full items-start gap-0">
      {ETAPAS_STATUS.map((etapa, idx) => {
        const concluida = idx < indiceAtual;
        const ativa = idx === indiceAtual;
        const ultima = idx === ETAPAS_STATUS.length - 1;

        return (
          <div key={etapa.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {idx > 0 && (
                <div className={`h-1 flex-1 transition-all duration-500 ${concluida || ativa ? 'bg-viva-roxo' : 'bg-gray-200'}`} />
              )}
              <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-500 ${
                concluida ? 'border-viva-roxo bg-viva-roxo text-white' :
                ativa ? 'border-viva-roxo bg-white text-viva-roxo' :
                'border-gray-300 bg-gray-100 text-gray-400'
              }`}>
                {concluida ? 'V' : ''}
              </div>
              {!ultima && (
                <div className={`h-1 flex-1 transition-all duration-500 ${concluida ? 'bg-viva-roxo' : 'bg-gray-200'}`} />
              )}
            </div>
            <p className={`mt-1.5 text-center text-[10px] font-semibold leading-tight ${
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
  const [historicoPedidos, setHistoricoPedidos] = useState<Pedido[]>([]);
  const [pedidoAberto, setPedidoAberto] = useState<string | null>(null);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [pedidoPagando, setPedidoPagando] = useState<string | null>(null);
  const [mensagemPagamento, setMensagemPagamento] = useState<string | null>(null);
  const [codigosEntrega, setCodigosEntrega] = useState<Record<string, string>>({});
  const [confirmandoRecebimento, setConfirmandoRecebimento] = useState<string | null>(null);
  const [mensagemEntrega, setMensagemEntrega] = useState<{ texto: string; erro?: boolean } | null>(null);

  const carregarPedidos = useCallback(async (userId: string) => {
    const limite = limiteHistoricoISO();
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('cliente_id', userId)
      .or(`status.neq.Entregue,updated_at.gte.${limite}`)
      .order('criado_em', { ascending: false });

    if (!error && data) {
      const lista = data as Pedido[];
      setPedidos(lista);
      const emRota = lista.filter(item => item.status === 'Saiu para Entrega');
      const resultados = await Promise.all(emRota.map(async pedido => {
        const { data: codigo } = await supabase.rpc('obter_codigo_entrega_cliente', { p_pedido_id: pedido.id });
        return [pedido.id, typeof codigo === 'string' ? codigo : ''] as const;
      }));
      setCodigosEntrega(Object.fromEntries(resultados.filter(([, codigo]) => codigo)));
    }
  }, []);

  const carregarHistorico = useCallback(async (userId: string) => {
    setCarregandoHistorico(true);
    const limite = limiteHistoricoISO();
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('cliente_id', userId)
      .eq('status', 'Entregue')
      .lt('updated_at', limite)
      .order('criado_em', { ascending: false });

    if (!error && data) setHistoricoPedidos(data as Pedido[]);
    setCarregandoHistorico(false);
  }, []);

  useEffect(() => {
    let ativo = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!ativo) return;
      if (!user) {
        router.push('/login');
        return;
      }

      await carregarPedidos(user.id);
      if (!ativo) return;

      channel = supabase
        .channel(`cliente-pedidos-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pedidos', filter: `cliente_id=eq.${user.id}` },
          () => {
            carregarPedidos(user.id);
            if (mostrarHistorico) carregarHistorico(user.id);
          },
        )
        .subscribe();
      setLoading(false);
    }

    init();

    return () => {
      ativo = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [router, carregarPedidos, carregarHistorico, mostrarHistorico]);

  const alternarHistorico = async () => {
    const proximo = !mostrarHistorico;
    setMostrarHistorico(proximo);
    if (!proximo || historicoPedidos.length > 0 || carregandoHistorico) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (user) await carregarHistorico(user.id);
  };

  const pagarPedido = async (pedido: Pedido) => {
    setMensagemPagamento(null);
    setPedidoPagando(pedido.id);

    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        router.push('/login');
        return;
      }

      const resposta = await fetch('/api/mercadopago/preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          pedidoId: pedido.id,
          itens: pedido.itens ?? [],
          payer: {
            email: session.user.email,
          },
        }),
      });

      const pagamento = await resposta.json();
      if (!resposta.ok) {
        throw new Error(pagamento.error || 'Não foi possível iniciar o pagamento.');
      }

      const checkoutUrl = pagamento.initPoint || pagamento.sandboxInitPoint;
      if (!checkoutUrl) throw new Error('Mercado Pago não retornou a URL de pagamento.');
      window.location.href = checkoutUrl;
    } catch (err: any) {
      setMensagemPagamento(err.message || 'Erro ao iniciar pagamento.');
    } finally {
      setPedidoPagando(null);
    }
  };

  const confirmarRecebimento = async (pedido: Pedido) => {
    if (!window.confirm('Confirma que recebeu seu pedido?')) return;
    setConfirmandoRecebimento(pedido.id);
    setMensagemEntrega(null);
    const { data, error } = await supabase.rpc('confirmar_entrega_pelo_cliente', { p_pedido_id: pedido.id });
    setConfirmandoRecebimento(null);
    if (error) { setMensagemEntrega({ texto: error.message, erro: true }); return; }
    const resposta = data as { ok?: boolean; message?: string } | null;
    setMensagemEntrega({ texto: resposta?.message || (resposta?.ok ? 'Recebimento confirmado.' : 'Não foi possível confirmar.'), erro: !resposta?.ok });
    if (resposta?.ok) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await carregarPedidos(user.id);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="animate-pulse text-gray-500">Carregando seus pedidos...</p>
      </div>
    );
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-gray-50 pb-24 font-sans shadow-2xl md:max-w-6xl">
      {mensagemPagamento && (
        <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl bg-red-500 px-4 py-3 text-center text-sm font-bold text-white shadow-xl">
          {mensagemPagamento}
        </div>
      )}
      {mensagemEntrega && (
        <div className={`fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl px-4 py-3 text-center text-sm font-bold text-white shadow-xl ${mensagemEntrega.erro ? 'bg-red-500' : 'bg-emerald-600'}`}>
          {mensagemEntrega.texto}
        </div>
      )}
      <header className="border-b border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-1 text-gray-400 hover:text-viva-roxo">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1">
            <Logo />
          </div>
        </div>
        <h1 className="mt-3 text-xl font-bold text-gray-800">Meus Pedidos</h1>
      </header>

      <main className="space-y-4 p-4">
        <div className="rounded-2xl border border-viva-verde/40 bg-viva-verde/20 p-3 text-center text-xs font-black text-viva-roxo">
          Prazo estimado de entrega: ate 24hs apos a confirmacao do pedido.
        </div>
        <>
        {pedidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-16">
            <div className="text-6xl">&#128203;</div>
            <p className="text-center font-semibold text-gray-500">Nenhum pedido em andamento.</p>
            <Link
              href="/"
              className="rounded-xl bg-viva-roxo px-6 py-3 font-bold text-white shadow-lg transition-all hover:brightness-110"
            >
              Ver cardápio
            </Link>
          </div>
        ) : (
          pedidos.map(pedido => {
            const aberto = pedidoAberto === pedido.id;
            const isCancelado = pedido.status === 'Cancelado';
            const isFinalizado = ['Concluído', 'Concluido', 'Conclu¡do', 'Entregue'].includes(pedido.status);

            return (
              <div
                key={pedido.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${
                  isCancelado ? 'border-red-100 opacity-75' : 'border-gray-100'
                }`}
              >
                <button
                  onClick={() => setPedidoAberto(aberto ? null : pedido.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-500">{formatarData(pedido.criado_em ?? pedido.created_at)}</p>
                      <p className="mt-0.5 max-w-[180px] truncate text-sm text-gray-600">
                        #{pedido.id.toString().slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeStatus(pedido.status)}`}>
                        {pedido.status}
                      </span>
                      <span className="text-base font-extrabold text-viva-roxo">
                        {formatarMoedaBR(totalPedido(pedido))}
                      </span>
                    </div>
                  </div>

                  {!isCancelado && <LinhaDoTempo status={pedido.status} />}
                  {isCancelado && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-sm text-red-400">!</span>
                      <span className="text-xs font-semibold text-red-400">Pedido cancelado</span>
                    </div>
                  )}

                  <div className="mt-2 flex justify-end">
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      {aberto ? 'Fechar detalhes' : 'Ver detalhes'}
                    </span>
                  </div>
                </button>

                {pedido.status === 'Aguardando Pagamento' && (
                  <div className="flex justify-end border-t border-orange-100 bg-orange-50 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => pagarPedido(pedido)}
                      disabled={pedidoPagando === pedido.id}
                      className="rounded-full bg-viva-roxo px-4 py-2 text-xs font-black text-white shadow-sm disabled:opacity-60"
                    >
                      {pedidoPagando === pedido.id ? 'Abrindo...' : 'Pagar'}
                    </button>
                  </div>
                )}

                {aberto && (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50 p-4">
                    {pedido.status === 'Saiu para Entrega' && (
                      <div className="border-l-4 border-viva-verde bg-white p-4 shadow-sm">
                        <p className="text-xs font-black uppercase text-viva-roxo">Seu pedido está em rota</p>
                        {pedido.entrega_janela && <p className="mt-1 text-xs font-bold text-gray-500">Previsão: {pedido.entrega_janela}</p>}
                        <p className="mt-3 text-xs font-bold text-gray-500">Código de confirmação</p>
                        <p className="mt-1 font-mono text-3xl font-black tracking-[0.3em] text-gray-900">{codigosEntrega[pedido.id] || '------'}</p>
                        <p className="mt-2 text-xs text-gray-500">Informe este código ao entregador somente após receber o pedido.</p>
                        <button
                          type="button"
                          onClick={() => confirmarRecebimento(pedido)}
                          disabled={confirmandoRecebimento === pedido.id}
                          className="mt-4 h-12 w-full rounded-xl bg-viva-verde text-sm font-black text-viva-roxo disabled:opacity-50"
                        >
                          {confirmandoRecebimento === pedido.id ? 'Confirmando...' : 'Recebi meu pedido'}
                        </button>
                      </div>
                    )}
                    <div>
                      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">Endereço de entrega</p>
                      <p className="text-sm text-gray-700">{enderecoPedido(pedido)}</p>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Itens do pedido</p>
                      <div className="space-y-1.5">
                        {(pedido.itens ?? []).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-gray-700">{item.quantidade}x {item.nome}</span>
                            <span className="font-semibold text-gray-800">{formatarMoedaBR(item.subtotal ?? item.preco * item.quantidade)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between border-t border-gray-200 pt-1.5 text-sm font-bold">
                          <span className="text-gray-700">Total</span>
                          <span className="text-viva-roxo">{formatarMoedaBR(totalPedido(pedido))}</span>
                        </div>
                      </div>
                    </div>

                    {(pedido.pagamento_status || pedido.mercado_pago_status_detail || pedido.cielo_return_message) && (
                      <div className="rounded-xl border border-orange-100 bg-orange-50 p-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-orange-600">
                          {nomeMeioPagamento(pedido.meio_pagamento)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-orange-800">
                          {pedido.pagamento_status || 'sem status'}
                          {pedido.meio_pagamento?.startsWith('cielo_')
                            ? (pedido.cielo_return_message ? ` - ${pedido.cielo_return_message}` : '')
                            : (pedido.mercado_pago_status_detail ? ` - ${pedido.mercado_pago_status_detail}` : '')}
                        </p>
                      </div>
                    )}

                    {!isCancelado && !isFinalizado && (
                      <div className="rounded-xl bg-viva-verde/20 p-3">
                        <p className="text-center text-xs font-semibold text-viva-roxo">
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

          <section className="space-y-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={alternarHistorico}
              className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left text-sm font-black text-gray-700 shadow-sm"
            >
              <span>Histórico de pedidos</span>
              <span className="text-xs text-gray-400">{mostrarHistorico ? 'Ocultar' : 'Ver histórico'}</span>
            </button>

            {mostrarHistorico && carregandoHistorico && (
              <p className="rounded-2xl bg-white p-4 text-center text-xs font-semibold text-gray-400">Carregando histórico...</p>
            )}

            {mostrarHistorico && !carregandoHistorico && historicoPedidos.length === 0 && (
              <p className="rounded-2xl bg-white p-4 text-center text-xs font-semibold text-gray-400">Nenhum pedido entregue há mais de 24h.</p>
            )}

            {mostrarHistorico && historicoPedidos.map(pedido => {
              const aberto = pedidoAberto === pedido.id;

              return (
                <div key={pedido.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white opacity-80 shadow-sm">
                  <button
                    onClick={() => setPedidoAberto(aberto ? null : pedido.id)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-500">{formatarData(pedido.criado_em ?? pedido.created_at)}</p>
                        <p className="mt-0.5 max-w-[180px] truncate text-sm text-gray-600">
                          #{pedido.id.toString().slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeStatus(pedido.status)}`}>
                          {pedido.status}
                        </span>
                        <span className="text-base font-extrabold text-viva-roxo">
                          {formatarMoedaBR(totalPedido(pedido))}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
                      <span className="text-xs text-gray-400">{aberto ? 'Fechar detalhes' : 'Ver detalhes'}</span>
                    </div>
                  </button>

                  {aberto && (
                    <div className="space-y-3 border-t border-gray-100 bg-gray-50 p-4">
                      <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">Endereço de entrega</p>
                        <p className="text-sm text-gray-700">{enderecoPedido(pedido)}</p>
                      </div>
                      <div className="space-y-1.5">
                        {(pedido.itens ?? []).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="text-gray-700">{item.quantidade}x {item.nome}</span>
                            <span className="font-semibold text-gray-800">{formatarMoedaBR(item.subtotal ?? item.preco * item.quantidade)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </>
      </main>

      <BottomNav active="pedidos" />
    </div>
  );
}
