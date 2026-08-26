'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/supabase';
import { nomeMeioPagamento } from '@/lib/meiosPagamento';

interface Entregador {
  email: string;
  role: 'delivery';
  nome: string;
  ativo: boolean;
  telefone: string | null;
  observacoes: string | null;
  user_id: string | null;
}

interface Perfil { id: string; nome?: string; nome_completo?: string; telefone?: string }
interface Pedido {
  plano_id?: string; pedido_origem_id?: number; entrega_prevista?: string; entrega_numero?: number;
  id: number; cliente_id: string | null; status: string; criado_em: string | null; updated_at: string | null;
  endereco_entrega: string | null; endereco: string | null; itens: Array<{ nome: string; quantidade: number }>;
  pagamento_status: string | null; meio_pagamento: string | null; tipo_venda: string;
  cliente_nome_balcao: string | null; cliente_telefone_balcao: string | null;
  entregador_id: string | null; entrega_atribuida_em: string | null; saiu_entrega_em: string | null;
  entregue_em: string | null; entrega_metodo_confirmacao: string | null; entrega_observacoes: string | null;
  entrega_janela: string | null;
}

interface Historico {
  id: number; pedido_id: number; evento: string; status_anterior: string | null; status_novo: string | null;
  entregador_anterior_id: string | null; entregador_novo_id: string | null; ator_tipo: string;
  metodo_confirmacao: string | null; detalhes: Record<string, unknown>; criado_em: string;
}

type StatusEntrega = 'aguardando' | 'atribuido' | 'rota' | 'entregue';

function statusEntrega(pedido: Pedido): StatusEntrega {
  if (pedido.status === 'Entregue') return 'entregue';
  if (pedido.status === 'Saiu para Entrega') return 'rota';
  if (pedido.entregador_id) return 'atribuido';
  return 'aguardando';
}

function nomeStatus(status: StatusEntrega) {
  return { aguardando: 'Aguardando atribuição', atribuido: 'Atribuído', rota: 'Saiu para entrega', entregue: 'Entregue' }[status];
}

function badgeStatus(status: StatusEntrega) {
  return { aguardando: 'bg-amber-100 text-amber-800', atribuido: 'bg-blue-100 text-blue-800', rota: 'bg-purple-100 text-purple-800', entregue: 'bg-emerald-100 text-emerald-800' }[status];
}

function formatarData(data?: string | null) {
  return data ? new Date(data).toLocaleString('pt-BR') : '-';
}

export default function AdminEntregasPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [perfis, setPerfis] = useState<Record<string, Perfil>>({});
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroEntregador, setFiltroEntregador] = useState('');
  const [filtroData, setFiltroData] = useState('');
  const [busca, setBusca] = useState('');
  const [pedidoHistorico, setPedidoHistorico] = useState<number | null>(null);
  const [atribuicao, setAtribuicao] = useState<{ pedido: Pedido; entregadorId: string; observacoes: string; janela: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const avisar = useCallback((texto: string, isErro = false) => {
    setMensagem({ texto, erro: isErro });
    window.setTimeout(() => setMensagem(null), 5000);
  }, []);

  const carregar = useCallback(async () => {
    setErro('');
    const [rolesRes, pedidosRes, historicoRes] = await Promise.all([
      supabase.from('admin_usuario_roles').select('email,role,nome,ativo,telefone,observacoes,user_id').eq('role', 'delivery').order('nome'),
      supabase.from('pedidos').select('id,cliente_id,status,criado_em,updated_at,endereco_entrega,endereco,itens,pagamento_status,meio_pagamento,tipo_venda,cliente_nome_balcao,cliente_telefone_balcao,entregador_id,entrega_atribuida_em,saiu_entrega_em,entregue_em,entrega_metodo_confirmacao,entrega_observacoes,entrega_janela,plano_id,pedido_origem_id,entrega_prevista,entrega_numero').eq('somente_planos', false).neq('status','Cancelado').order('criado_em', { ascending: false }),
      supabase.from('entregas_historico').select('*').order('criado_em', { ascending: false }).limit(1000),
    ]);
    const falha = rolesRes.error || pedidosRes.error || historicoRes.error;
    if (falha) { setErro(falha.message); return; }
    const listaPedidos = (pedidosRes.data ?? []) as Pedido[];
    const origens = Array.from(new Set(listaPedidos.map(p => p.pedido_origem_id).filter(Boolean)));
    if (origens.length) {
      const { data, error } = await supabase.from('pedidos').select('id,meio_pagamento,pagamento_status').in('id', origens);
      if (error) { setErro(error.message); return; }
      const mapa = new Map((data || []).map(p => [p.id, p]));
      listaPedidos.forEach(p => { const raiz = mapa.get(p.pedido_origem_id); if (raiz) { p.meio_pagamento = raiz.meio_pagamento; p.pagamento_status = raiz.pagamento_status; } });
    }
    setEntregadores((rolesRes.data ?? []) as Entregador[]);
    setPedidos(listaPedidos);
    setHistorico((historicoRes.data ?? []) as Historico[]);

    const ids = Array.from(new Set(listaPedidos.map(item => item.cliente_id).filter(Boolean))) as string[];
    if (!ids.length) { setPerfis({}); return; }
    const [pRes, cRes] = await Promise.all([
      supabase.from('perfis').select('id,nome,telefone').in('id', ids),
      supabase.from('perfis_clientes').select('id,nome_completo,telefone').in('id', ids),
    ]);
    const mapa: Record<string, Perfil> = {};
    (pRes.data ?? []).forEach(item => { mapa[item.id] = { ...mapa[item.id], ...item }; });
    (cRes.data ?? []).forEach(item => { mapa[item.id] = { ...mapa[item.id], ...item }; });
    setPerfis(mapa);
  }, []);

  useEffect(() => {
    async function iniciar() {
      setBusca(new URLSearchParams(window.location.search).get('pedido') || '');
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace('/login'); return; }
      const { data: admin } = await supabase.rpc('is_viva_leve_admin');
      if (!admin) { router.replace('/login'); return; }
      await carregar();
      setLoading(false);
    }
    iniciar();
  }, [carregar, router]);

  const nomeCliente = useCallback((pedido: Pedido) => {
    if (pedido.tipo_venda === 'balcao') return pedido.cliente_nome_balcao || 'Venda balcão';
    const perfil = pedido.cliente_id ? perfis[pedido.cliente_id] : undefined;
    return perfil?.nome_completo || perfil?.nome || 'Cliente não identificado';
  }, [perfis]);

  const telefoneCliente = useCallback((pedido: Pedido) => {
    if (pedido.tipo_venda === 'balcao') return pedido.cliente_telefone_balcao || '';
    return pedido.cliente_id ? perfis[pedido.cliente_id]?.telefone || '' : '';
  }, [perfis]);

  const entregadorPorId = useCallback((id?: string | null) => entregadores.find(item => item.user_id === id), [entregadores]);

  const pedidosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return pedidos.filter(pedido => {
      const status = statusEntrega(pedido);
      const data = (pedido.entrega_prevista || pedido.criado_em || '').slice(0, 10);
      const texto = `${pedido.id} ${nomeCliente(pedido)} ${telefoneCliente(pedido)}`.toLocaleLowerCase('pt-BR');
      return (!filtroStatus || status === filtroStatus)
        && (!filtroEntregador || pedido.entregador_id === filtroEntregador)
        && (!filtroData || data === filtroData)
        && (!termo || texto.includes(termo));
    });
  }, [pedidos, busca, filtroStatus, filtroEntregador, filtroData, nomeCliente, telefoneCliente]);

  const totais = useMemo(() => ({
    aguardando: pedidos.filter(item => statusEntrega(item) === 'aguardando').length,
    atribuido: pedidos.filter(item => statusEntrega(item) === 'atribuido').length,
    rota: pedidos.filter(item => statusEntrega(item) === 'rota').length,
    entregue: pedidos.filter(item => statusEntrega(item) === 'entregue').length,
  }), [pedidos]);

  async function atribuir() {
    if (!atribuicao) return;
    setSalvando(true);
    const { error } = await supabase.rpc('atribuir_entregador_pedido', {
      p_pedido_id: atribuicao.pedido.id,
      p_entregador_id: atribuicao.entregadorId || null,
      p_observacoes: atribuicao.observacoes || null,
      p_janela: atribuicao.janela || null,
    });
    setSalvando(false);
    if (error) { avisar(`Erro ao atribuir: ${error.message}`, true); return; }
    avisar(atribuicao.entregadorId ? 'Entregador atribuído com sucesso.' : 'Atribuição removida.');
    setAtribuicao(null); await carregar();
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-gray-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-viva-roxo" /></div>;

  return (
    <main className="min-h-screen bg-gray-100 p-4 text-gray-900 md:p-6">
      {mensagem && <div className={`fixed right-4 top-4 z-[90] max-w-sm px-4 py-3 text-sm font-bold text-white shadow-xl ${mensagem.erro ? 'bg-red-600' : 'bg-emerald-600'}`}>{mensagem.texto}</div>}
      <div className="mx-auto max-w-screen-2xl">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-black uppercase text-viva-roxo">Viva Leve Admin</p><h1 className="text-2xl font-black">Entregas</h1><p className="text-sm text-gray-500">Atribuição, rota e confirmação auditável.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/admin/usuarios?perfil=delivery" className="flex h-11 items-center bg-viva-verde px-4 text-sm font-black text-viva-roxo">Gerenciar entregadores</Link><Link href="/admin" className="flex h-11 items-center border border-gray-300 bg-white px-4 text-sm font-black text-viva-roxo">Voltar ao Admin</Link></div>
        </header>
        {erro && <div className="mb-4 border-l-4 border-red-500 bg-red-50 p-4 text-sm font-bold text-red-700">Erro ao carregar: {erro}</div>}

        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {([['Aguardando atribuição', totais.aguardando, 'text-amber-700'], ['Atribuídas', totais.atribuido, 'text-blue-700'], ['Em rota', totais.rota, 'text-purple-700'], ['Concluídas', totais.entregue, 'text-emerald-700']] as const).map(item => <article key={item[0]} className="border-l-4 border-gray-300 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-gray-500">{item[0]}</p><p className={`mt-2 text-3xl font-black ${item[2]}`}>{item[1]}</p></article>)}
        </section>

        <section className="mb-5 bg-white p-4 shadow-sm">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Cliente, telefone ou nº do pedido" className="h-11 border border-gray-300 px-3 text-sm md:col-span-2" />
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="h-11 border border-gray-300 px-3 text-sm font-bold"><option value="">Todos os status</option><option value="aguardando">Aguardando atribuição</option><option value="atribuido">Atribuído</option><option value="rota">Saiu para entrega</option><option value="entregue">Entregue</option></select>
            <select value={filtroEntregador} onChange={e => setFiltroEntregador(e.target.value)} className="h-11 border border-gray-300 px-3 text-sm font-bold"><option value="">Todos os entregadores</option>{entregadores.map(item => <option key={item.email} value={item.user_id || ''}>{item.nome}</option>)}</select>
            <input type="date" value={filtroData} onChange={e => setFiltroData(e.target.value)} className="h-11 border border-gray-300 px-3 text-sm" />
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-3">
            {pedidosFiltrados.map(pedido => {
              const status = statusEntrega(pedido); const responsavel = entregadorPorId(pedido.entregador_id);
              return <article key={pedido.id} className="bg-white shadow-sm"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 p-4"><div><p className="font-mono text-xs font-bold text-gray-400">PEDIDO #{pedido.id}</p><h2 className="mt-1 text-lg font-black">{nomeCliente(pedido)}</h2><p className="text-sm text-gray-500">{telefoneCliente(pedido) || 'Telefone não informado'}</p></div><span className={`px-3 py-1 text-xs font-black uppercase ${badgeStatus(status)}`}>{nomeStatus(status)}</span></header><div className="grid gap-4 p-4 md:grid-cols-2"><div><p className="text-xs font-black uppercase text-gray-400">Endereço</p><p className="mt-1 text-sm font-bold text-gray-700">{pedido.endereco_entrega || pedido.endereco || 'Retirada / endereço não informado'}</p><p className="mt-3 text-xs font-black uppercase text-gray-400">Responsável</p><p className="mt-1 text-sm font-bold">{responsavel?.nome || 'Ainda não atribuído'}</p>{pedido.entrega_janela && <p className="text-xs text-gray-500">Janela: {pedido.entrega_janela}</p>}</div><div><p className="text-xs font-black uppercase text-gray-400">Pagamento</p><p className="mt-1 text-sm font-bold">{pedido.plano_id && <Link href="/admin/planos" className="block text-viva-roxo underline">Plano · Entrega {pedido.entrega_numero} · {pedido.entrega_prevista?.split('-').reverse().join('/')}</Link>}{nomeMeioPagamento(pedido.meio_pagamento)} · {pedido.pagamento_status || 'não informado'}</p><p className="mt-3 text-xs font-black uppercase text-gray-400">Itens</p><p className="mt-1 text-sm text-gray-600">{(pedido.itens || []).map(item => `${item.quantidade}x ${item.nome}`).join(' · ')}</p></div></div><footer className="flex flex-wrap gap-2 border-t border-gray-100 p-4"><button onClick={() => setAtribuicao({ pedido, entregadorId: pedido.entregador_id || '', observacoes: pedido.entrega_observacoes || '', janela: pedido.entrega_janela || '' })} disabled={status === 'entregue'} className="h-10 bg-viva-roxo px-4 text-xs font-black text-white disabled:opacity-40">{pedido.entregador_id ? 'Alterar entregador' : 'Atribuir entregador'}</button><button onClick={() => setPedidoHistorico(pedidoHistorico === pedido.id ? null : pedido.id)} className="h-10 border border-gray-300 px-4 text-xs font-black text-gray-700">{pedidoHistorico === pedido.id ? 'Ocultar histórico' : 'Ver histórico'}</button></footer>{pedidoHistorico === pedido.id && <div className="border-t bg-gray-50 p-4"><h3 className="mb-3 text-sm font-black">Histórico da entrega</h3><div className="space-y-2">{historico.filter(item => item.pedido_id === pedido.id).map(item => <div key={item.id} className="grid grid-cols-[7rem_1fr] gap-3 text-xs"><span className="text-gray-400">{formatarData(item.criado_em)}</span><span className="font-bold text-gray-700">{item.evento.replace(/_/g, ' ')}{item.metodo_confirmacao ? ` · ${item.metodo_confirmacao.replace(/_/g, ' ')}` : ''}</span></div>)}{!historico.some(item => item.pedido_id === pedido.id) && <p className="text-xs text-gray-400">Nenhum evento logístico registrado.</p>}</div></div>}</article>;
            })}
            {!pedidosFiltrados.length && <div className="bg-white p-10 text-center text-sm text-gray-400">Nenhuma entrega encontrada.</div>}
          </section>

          <aside className="h-fit bg-white shadow-sm"><header className="border-b p-4"><h2 className="font-black">Equipe de entrega</h2><p className="text-xs text-gray-500">Ativos e produtividade acumulada.</p></header><div className="divide-y divide-gray-100">{entregadores.map(item => { const concluidas = pedidos.filter(p => p.entregador_id === item.user_id && statusEntrega(p) === 'entregue').length; const abertas = pedidos.filter(p => p.entregador_id === item.user_id && statusEntrega(p) !== 'entregue').length; return <div key={item.email} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.nome}</p><p className="text-xs text-gray-500">{item.telefone || item.email}</p></div><span className={`px-2 py-1 text-[10px] font-black uppercase ${item.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>{item.ativo ? 'Ativo' : 'Inativo'}</span></div><p className="mt-2 text-xs font-bold text-gray-500">{abertas} pendentes · {concluidas} concluídas</p><Link href={`/admin/usuarios?email=${encodeURIComponent(item.email)}`} className="mt-2 inline-block text-xs font-black text-viva-roxo hover:underline">Editar em Usuários e Perfis</Link></div>; })}{!entregadores.length && <p className="p-6 text-center text-sm text-gray-400">Nenhum entregador cadastrado.</p>}</div></aside>
        </div>
      </div>

      {atribuicao && <div className="fixed inset-0 z-[80] flex items-end bg-black/55 md:items-center md:justify-center md:p-4"><section className="w-full bg-white p-5 shadow-2xl md:max-w-lg"><h2 className="text-xl font-black">Atribuir pedido #{atribuicao.pedido.id}</h2><label className="mt-4 block text-xs font-black uppercase text-gray-500">Entregador<select value={atribuicao.entregadorId} onChange={e => setAtribuicao({ ...atribuicao, entregadorId: e.target.value })} className="mt-1 h-12 w-full border border-gray-300 px-3 text-sm"><option value="">Remover atribuição</option>{entregadores.filter(item => item.ativo && item.user_id).map(item => <option key={item.email} value={item.user_id!}>{item.nome} · {item.telefone || item.email}</option>)}</select></label><label className="mt-3 block text-xs font-black uppercase text-gray-500">Horário / janela<input value={atribuicao.janela} onChange={e => setAtribuicao({ ...atribuicao, janela: e.target.value })} placeholder="Ex.: 14h às 16h" className="mt-1 h-12 w-full border border-gray-300 px-3 text-sm" /></label><label className="mt-3 block text-xs font-black uppercase text-gray-500">Observação da entrega<textarea value={atribuicao.observacoes} onChange={e => setAtribuicao({ ...atribuicao, observacoes: e.target.value })} rows={3} className="mt-1 w-full border border-gray-300 p-3 text-sm" /></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setAtribuicao(null)} className="h-11 border px-4 text-sm font-black">Cancelar</button><button disabled={salvando} onClick={atribuir} className="h-11 bg-viva-verde px-5 text-sm font-black text-viva-roxo disabled:opacity-50">{salvando ? 'Salvando...' : 'Confirmar'}</button></div></section></div>}

    </main>
  );
}
