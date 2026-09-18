'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/supabase';
import { nomeMeioPagamento } from '@/lib/meiosPagamento';
import { dataBrasilia, somarDias } from '@/lib/planosMarmitas';

interface Entregador { email: string; nome: string; ativo: boolean; telefone: string | null; user_id: string | null }
interface Perfil { id: string; nome?: string; nome_completo?: string; telefone?: string; regiao_df?: string; endereco_uf?: string }
interface Pedido {
  id: number; cliente_id: string | null; status: string; criado_em: string | null;
  endereco_entrega: string | null; endereco: string | null; itens: Array<{ nome: string; quantidade: number }>;
  pagamento_status: string | null; status_pagamento_operacional: string; status_entrega_operacional: string;
  meio_pagamento: string | null; voucher_bandeira: string | null; tipo_venda: string;
  cliente_nome_balcao: string | null; cliente_telefone_balcao: string | null;
  entregador_id: string | null; entrega_observacoes: string | null; entrega_janela: string | null;
  plano_id: string | null; pedido_origem_id: number | null; entrega_prevista: string | null; entrega_numero: number | null;
  plano_nome?: string;
}
interface Historico { id: number; pedido_id: number; evento: string; metodo_confirmacao: string | null; criado_em: string }
type Grupo = 'Atrasadas' | 'Hoje' | 'Amanhã' | 'Próximos dias' | 'Concluídas';
type ModalAcao = { pedido: Pedido; acao: 'tentativa' | 'cancelar'; observacao: string };

const CAMPOS = 'id,cliente_id,status,criado_em,endereco_entrega,endereco,itens,pagamento_status,status_pagamento_operacional,status_entrega_operacional,meio_pagamento,voucher_bandeira,tipo_venda,cliente_nome_balcao,cliente_telefone_balcao,entregador_id,entrega_observacoes,entrega_janela,plano_id,pedido_origem_id,entrega_prevista,entrega_numero';
const STATUS_ENTREGA = ['PROGRAMADA', 'ATRIBUIDA', 'PRONTA', 'EM_ROTA', 'NAO_ENTREGUE', 'ENTREGUE', 'CANCELADA'];
const NOMES_STATUS: Record<string, string> = { PROGRAMADA: 'Programada', ATRIBUIDA: 'Atribuída', PRONTA: 'Pronta', EM_ROTA: 'Em rota', NAO_ENTREGUE: 'Não entregue', ENTREGUE: 'Entregue', CANCELADA: 'Cancelada' };
function dataEntrega(p: Pedido) { return (p.entrega_prevista || p.criado_em || '').slice(0, 10); }
function encerrada(p: Pedido) { return ['ENTREGUE', 'CANCELADA'].includes(p.status_entrega_operacional); }
function grupoEntrega(p: Pedido): Grupo {
  if (encerrada(p)) return 'Concluídas';
  const hoje = dataBrasilia(); const data = dataEntrega(p);
  if (data < hoje) return 'Atrasadas';
  if (data === hoje) return 'Hoje';
  if (data === somarDias(hoje, 1)) return 'Amanhã';
  return 'Próximos dias';
}
function formatarData(data?: string | null, hora = false) {
  if (!data) return '-';
  if (!hora && /^\d{4}-\d{2}-\d{2}$/.test(data)) return data.split('-').reverse().join('/');
  return new Date(data).toLocaleString('pt-BR', { dateStyle: 'short', ...(hora ? { timeStyle: 'short' } : {}) });
}
function pedidoAptoParaGestaoDeEntrega(p: Pedido) {
  return !p.status.toLowerCase().includes('cancelado') && (['PAGO', 'PAGAMENTO_NA_ENTREGA'].includes(p.status_pagamento_operacional) || encerrada(p));
}
function classeStatus(status: string) {
  if (status === 'ENTREGUE') return 'bg-emerald-100 text-emerald-800';
  if (status === 'EM_ROTA') return 'bg-purple-100 text-purple-800';
  if (['NAO_ENTREGUE', 'CANCELADA'].includes(status)) return 'bg-red-100 text-red-800';
  if (['PRONTA', 'ATRIBUIDA'].includes(status)) return 'bg-blue-100 text-blue-800';
  return 'bg-amber-100 text-amber-800';
}

export default function AdminEntregasPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true); const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [entregadores, setEntregadores] = useState<Entregador[]>([]); const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [perfis, setPerfis] = useState<Record<string, Perfil>>({}); const [historico, setHistorico] = useState<Historico[]>([]);
  const [busca, setBusca] = useState(''); const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroEntregador, setFiltroEntregador] = useState(''); const [filtroOrigem, setFiltroOrigem] = useState('');
  const [filtroPagamento, setFiltroPagamento] = useState(''); const [filtroRegiao, setFiltroRegiao] = useState('');
  const [dataInicio, setDataInicio] = useState(''); const [dataFim, setDataFim] = useState('');
  const [somenteAtrasadas, setSomenteAtrasadas] = useState(false); const [modo, setModo] = useState<'lista' | 'calendario'>('lista');
  const [mesCalendario, setMesCalendario] = useState(dataBrasilia().slice(0, 7)); const [pedidoHistorico, setPedidoHistorico] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [atribuicao, setAtribuicao] = useState<{ pedido: Pedido; entregadorId: string; observacoes: string; janela: string } | null>(null);
  const [confirmacaoAdmin, setConfirmacaoAdmin] = useState<{ pedido: Pedido; observacao: string } | null>(null);
  const [modalAcao, setModalAcao] = useState<ModalAcao | null>(null);

  const avisar = useCallback((texto: string, isErro = false) => { setMensagem({ texto, erro: isErro }); window.setTimeout(() => setMensagem(null), 5000); }, []);
  const carregar = useCallback(async () => {
    setErro('');
    const [rolesRes, pedidosRes, historicoRes, planosRes] = await Promise.all([
      supabase.from('admin_usuario_roles').select('email,nome,ativo,telefone,user_id').eq('role', 'delivery').order('nome'),
      supabase.from('pedidos').select(CAMPOS).eq('somente_planos', false).is('cancelado_admin_em', null).order('criado_em', { ascending: false }),
      supabase.from('entregas_historico').select('id,pedido_id,evento,metodo_confirmacao,criado_em').order('criado_em', { ascending: false }).limit(1500),
      supabase.from('planos_marmitas').select('id,nome'),
    ]);
    const falha = rolesRes.error || pedidosRes.error || historicoRes.error || planosRes.error;
    if (falha) { setErro(falha.message); return; }
    const lista = (pedidosRes.data || []) as unknown as Pedido[];
    const origens = Array.from(new Set(lista.map(p => p.pedido_origem_id).filter(Boolean))) as number[];
    const raizesRes = origens.length ? await supabase.from('pedidos').select('id,status,pagamento_status,status_pagamento_operacional,meio_pagamento,voucher_bandeira').in('id', origens) : { data: [], error: null };
    if (raizesRes.error) { setErro(raizesRes.error.message); return; }
    const raizes = new Map((raizesRes.data || []).map((p: any) => [p.id, p]));
    const planos = new Map((planosRes.data || []).map((p: any) => [p.id, p.nome]));
    lista.forEach(p => { p.plano_nome = p.plano_id ? planos.get(p.plano_id) : undefined; const raiz: any = p.pedido_origem_id ? raizes.get(p.pedido_origem_id) : null; if (raiz) { p.meio_pagamento = raiz.meio_pagamento; p.pagamento_status = raiz.pagamento_status; p.status_pagamento_operacional = raiz.status_pagamento_operacional; p.voucher_bandeira = raiz.voucher_bandeira; } });
    const aptos = lista.filter(pedidoAptoParaGestaoDeEntrega);
    setEntregadores((rolesRes.data || []) as Entregador[]); setPedidos(aptos); setHistorico((historicoRes.data || []) as Historico[]);
    const ids = Array.from(new Set(aptos.map(p => p.cliente_id).filter(Boolean))) as string[];
    if (!ids.length) { setPerfis({}); return; }
    const [pRes, cRes] = await Promise.all([supabase.from('perfis').select('id,nome,telefone').in('id', ids), supabase.from('perfis_clientes').select('id,nome_completo,telefone,regiao_df,endereco_uf').in('id', ids)]);
    if (pRes.error || cRes.error) { setErro((pRes.error || cRes.error)!.message); return; }
    const mapa: Record<string, Perfil> = {}; (pRes.data || []).forEach(p => { mapa[p.id] = { ...mapa[p.id], ...p }; }); (cRes.data || []).forEach(p => { mapa[p.id] = { ...mapa[p.id], ...p }; }); setPerfis(mapa);
  }, []);

  useEffect(() => { (async () => { setBusca(new URLSearchParams(window.location.search).get('pedido') || ''); const { data } = await supabase.auth.getUser(); if (!data.user) return router.replace('/login'); const { data: admin } = await supabase.rpc('is_viva_leve_admin'); if (!admin) return router.replace('/login'); await carregar(); setLoading(false); })(); }, [carregar, router]);
  useEffect(() => { if (loading) return; const canal = supabase.channel(`admin-entregas-${Date.now()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, carregar).subscribe(); return () => { supabase.removeChannel(canal); }; }, [loading, carregar]);

  const perfil = useCallback((p: Pedido) => p.cliente_id ? perfis[p.cliente_id] : undefined, [perfis]);
  const nomeCliente = useCallback((p: Pedido) => p.tipo_venda === 'balcao' ? p.cliente_nome_balcao || 'Venda balcão' : perfil(p)?.nome_completo || perfil(p)?.nome || 'Cliente não identificado', [perfil]);
  const telefone = useCallback((p: Pedido) => p.tipo_venda === 'balcao' ? p.cliente_telefone_balcao || '' : perfil(p)?.telefone || '', [perfil]);
  const responsavel = useCallback((id?: string | null) => entregadores.find(e => e.user_id === id), [entregadores]);
  const regioes = useMemo(() => Array.from(new Set(Object.values(perfis).map(p => p.regiao_df).filter(Boolean))).sort() as string[], [perfis]);
  const filtrados = useMemo(() => pedidos.filter(p => {
    const data = dataEntrega(p); const termo = busca.trim().toLocaleLowerCase('pt-BR');
    const texto = `${p.id} ${p.pedido_origem_id || ''} ${nomeCliente(p)} ${telefone(p)} ${p.plano_nome || ''}`.toLocaleLowerCase('pt-BR');
    return (!termo || texto.includes(termo)) && (!filtroStatus || p.status_entrega_operacional === filtroStatus) && (!filtroEntregador || p.entregador_id === filtroEntregador)
      && (!filtroOrigem || (filtroOrigem === 'kit' ? Boolean(p.plano_id) : !p.plano_id)) && (!filtroPagamento || p.status_pagamento_operacional === filtroPagamento)
      && (!filtroRegiao || perfil(p)?.regiao_df === filtroRegiao) && (!dataInicio || data >= dataInicio) && (!dataFim || data <= dataFim) && (!somenteAtrasadas || grupoEntrega(p) === 'Atrasadas');
  }).sort((a, b) => dataEntrega(a).localeCompare(dataEntrega(b)) || a.id - b.id), [pedidos, busca, filtroStatus, filtroEntregador, filtroOrigem, filtroPagamento, filtroRegiao, dataInicio, dataFim, somenteAtrasadas, nomeCliente, telefone, perfil]);
  const grupos = useMemo(() => (['Atrasadas', 'Hoje', 'Amanhã', 'Próximos dias', 'Concluídas'] as Grupo[]).map(nome => ({ nome, itens: filtrados.filter(p => grupoEntrega(p) === nome) })).filter(g => g.itens.length), [filtrados]);

  async function atribuir() { if (!atribuicao) return; setSalvando(true); const { error } = await supabase.rpc('atribuir_entregador_pedido', { p_pedido_id: atribuicao.pedido.id, p_entregador_id: atribuicao.entregadorId || null, p_observacoes: atribuicao.observacoes || null, p_janela: atribuicao.janela || null }); setSalvando(false); if (error) return avisar(error.message, true); setAtribuicao(null); avisar('Atribuição atualizada.'); await carregar(); }
  async function executarAcao(pedido: Pedido, acao: string, observacao?: string) { setSalvando(true); const { data, error } = await supabase.rpc('gerenciar_entrega_admin', { p_pedido_id: pedido.id, p_acao: acao, p_observacao: observacao || null }); setSalvando(false); if (error || !data?.ok) return avisar(error?.message || data?.message || 'Ação não concluída.', true); setModalAcao(null); avisar('Entrega atualizada.'); await carregar(); }
  async function confirmarViaAdmin() { if (!confirmacaoAdmin) return; setSalvando(true); const { data, error } = await supabase.rpc('confirmar_entrega_pelo_admin', { p_pedido_id: confirmacaoAdmin.pedido.id, p_observacao: confirmacaoAdmin.observacao || null }); setSalvando(false); if (error || !data?.ok) return avisar(error?.message || data?.message || 'Não foi possível confirmar.', true); setConfirmacaoAdmin(null); avisar('Entrega confirmada via admin.'); await carregar(); }
  function mudarMes(delta: number) { const [ano, mes] = mesCalendario.split('-').map(Number); setMesCalendario(new Date(Date.UTC(ano, mes - 1 + delta, 1)).toISOString().slice(0, 7)); }

  const Card = ({ pedido }: { pedido: Pedido }) => { const status = pedido.status_entrega_operacional; const ent = responsavel(pedido.entregador_id); return <article className={`bg-white shadow-sm ${grupoEntrega(pedido) === 'Atrasadas' ? 'border-l-4 border-red-500' : ''}`}>
    {pedido.status_pagamento_operacional === 'PAGAMENTO_NA_ENTREGA' && <div className="bg-orange-500 px-4 py-2 text-center text-sm font-black uppercase text-white">Cobrar na entrega · {pedido.voucher_bandeira || 'Voucher'}</div>}
    <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4"><div><p className="font-mono text-xs font-bold text-gray-400">ENTREGA #{pedido.id}{pedido.pedido_origem_id ? ` · PEDIDO #${pedido.pedido_origem_id}` : ''}</p><h3 className="mt-1 text-lg font-black">{nomeCliente(pedido)}</h3><p className="text-sm text-gray-500">{telefone(pedido) || 'Telefone não informado'}</p></div><div className="flex gap-2"><span className={`px-3 py-1 text-xs font-black uppercase ${classeStatus(status)}`}>{NOMES_STATUS[status] || status}</span><span className={`px-3 py-1 text-xs font-black uppercase ${pedido.status_pagamento_operacional === 'PAGO' ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'}`}>{pedido.status_pagamento_operacional === 'PAGO' ? 'Pago' : 'Na entrega'}</span></div></header>
    <div className="grid gap-4 p-4 md:grid-cols-2"><div><p className="text-xs font-black uppercase text-gray-400">Destino</p><p className="mt-1 text-sm font-bold">{pedido.endereco_entrega || pedido.endereco || 'Endereço não informado'}</p><p className="mt-1 text-xs text-gray-500">{[perfil(pedido)?.regiao_df, perfil(pedido)?.endereco_uf].filter(Boolean).join(' / ') || 'Região não informada'}</p><p className="mt-3 text-xs font-black uppercase text-gray-400">Data e janela</p><p className="mt-1 text-sm font-bold">{formatarData(dataEntrega(pedido))}{pedido.entrega_janela ? ` · ${pedido.entrega_janela}` : ''}</p></div><div><p className="text-xs font-black uppercase text-gray-400">Origem e pagamento</p><p className="mt-1 text-sm font-bold">{pedido.plano_id ? `${pedido.plano_nome || 'Kit'} · Entrega ${pedido.entrega_numero}` : 'Pedido avulso'} · {nomeMeioPagamento(pedido.meio_pagamento)}</p><p className="mt-3 text-xs font-black uppercase text-gray-400">Itens</p><p className="mt-1 text-sm text-gray-600">{(pedido.itens || []).map(i => `${i.quantidade}x ${i.nome}`).join(' · ') || 'Sem itens'}</p><p className="mt-3 text-xs font-black uppercase text-gray-400">Entregador</p><p className="mt-1 text-sm font-bold">{ent?.nome || 'Não atribuído'}</p></div></div>
    {pedido.entrega_observacoes && <p className="mx-4 mb-4 whitespace-pre-line border-l-4 bg-gray-50 p-3 text-xs font-semibold">{pedido.entrega_observacoes}</p>}
    <footer className="flex flex-wrap gap-2 border-t p-4"><button onClick={() => setAtribuicao({ pedido, entregadorId: pedido.entregador_id || '', observacoes: pedido.entrega_observacoes || '', janela: pedido.entrega_janela || '' })} disabled={encerrada(pedido)} className="h-10 bg-viva-roxo px-3 text-xs font-black text-white disabled:opacity-40">{pedido.entregador_id ? 'Trocar entregador' : 'Atribuir'}</button>{!encerrada(pedido) && <><button onClick={() => executarAcao(pedido, 'preparar')} className="h-10 border px-3 text-xs font-black">Preparar</button><button onClick={() => executarAcao(pedido, 'pronta')} className="h-10 border px-3 text-xs font-black">Marcar pronta</button><button onClick={() => executarAcao(pedido, 'rota')} className="h-10 border px-3 text-xs font-black">Iniciar rota</button></>}{status === 'EM_ROTA' && <><button onClick={() => setModalAcao({ pedido, acao: 'tentativa', observacao: '' })} className="h-10 bg-amber-500 px-3 text-xs font-black">Não entregue</button><button onClick={() => setConfirmacaoAdmin({ pedido, observacao: '' })} className="h-10 bg-emerald-600 px-3 text-xs font-black text-white">Confirmar via admin</button></>}{!encerrada(pedido) && status !== 'EM_ROTA' && <button onClick={() => setModalAcao({ pedido, acao: 'cancelar', observacao: '' })} className="h-10 border border-red-300 px-3 text-xs font-black text-red-700">Cancelar entrega</button>}<button onClick={() => setPedidoHistorico(pedidoHistorico === pedido.id ? null : pedido.id)} className="h-10 border px-3 text-xs font-black">Histórico</button></footer>
    {pedidoHistorico === pedido.id && <div className="border-t bg-gray-50 p-4">{historico.filter(h => h.pedido_id === pedido.id).map(h => <p key={h.id} className="mb-2 text-xs"><span className="mr-3 text-gray-400">{formatarData(h.criado_em, true)}</span><strong>{h.evento.replace(/_/g, ' ')}</strong></p>)}{!historico.some(h => h.pedido_id === pedido.id) && <p className="text-xs text-gray-400">Nenhum evento registrado.</p>}</div>}
  </article>; };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-gray-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-viva-roxo" /></div>;
  const [ano, mes] = mesCalendario.split('-').map(Number); const primeiro = new Date(Date.UTC(ano, mes - 1, 1)); const diasMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate(); const celulas = [...Array(primeiro.getUTCDay()).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)];
  return <main className="min-h-screen bg-gray-100 p-4 text-gray-900 md:p-6">{mensagem && <div className={`fixed right-4 top-4 z-[100] max-w-sm p-4 text-sm font-bold text-white shadow-xl ${mensagem.erro ? 'bg-red-600' : 'bg-emerald-600'}`}>{mensagem.texto}</div>}<div className="mx-auto max-w-screen-2xl">
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-viva-roxo">Viva Leve Admin</p><h1 className="text-2xl font-black">Gerenciador de Entregas</h1><p className="text-sm text-gray-500">Pedidos avulsos e etapas de kits, com estados financeiro e logístico separados.</p></div><div className="flex gap-2"><Link href="/admin/usuarios?perfil=delivery" className="flex h-11 items-center bg-viva-verde px-4 text-sm font-black text-viva-roxo">Entregadores</Link><Link href="/admin" className="flex h-11 items-center border bg-white px-4 text-sm font-black text-viva-roxo">Voltar</Link></div></header>
    {erro && <div className="mb-4 border-l-4 border-red-500 bg-red-50 p-4 text-sm font-bold text-red-700">Erro ao carregar: {erro}</div>}
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{(['Atrasadas','Hoje','Amanhã','Próximos dias','Concluídas'] as Grupo[]).map(g => <article key={g} className="bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-gray-500">{g}</p><p className={`mt-2 text-3xl font-black ${g === 'Atrasadas' ? 'text-red-600' : 'text-viva-roxo'}`}>{pedidos.filter(p => grupoEntrega(p) === g).length}</p></article>)}</section>
    <section className="mb-5 bg-white p-4 shadow-sm"><div className="mb-4 flex gap-2"><button onClick={() => setModo('lista')} className={`h-10 px-4 text-sm font-black ${modo === 'lista' ? 'bg-viva-roxo text-white' : 'border'}`}>Lista</button><button onClick={() => setModo('calendario')} className={`h-10 px-4 text-sm font-black ${modo === 'calendario' ? 'bg-viva-roxo text-white' : 'border'}`}>Calendário</button></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Cliente, telefone, pedido ou plano" className="h-11 border px-3 text-sm md:col-span-2"/><select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="h-11 border px-3 text-sm"><option value="">Todos os status</option>{STATUS_ENTREGA.map(s => <option key={s} value={s}>{NOMES_STATUS[s]}</option>)}</select><select value={filtroEntregador} onChange={e => setFiltroEntregador(e.target.value)} className="h-11 border px-3 text-sm"><option value="">Todos os entregadores</option>{entregadores.map(e => <option key={e.email} value={e.user_id || ''}>{e.nome}</option>)}</select><select value={filtroOrigem} onChange={e => setFiltroOrigem(e.target.value)} className="h-11 border px-3 text-sm"><option value="">Avulsos e kits</option><option value="avulso">Pedidos avulsos</option><option value="kit">Entregas de kits</option></select><select value={filtroPagamento} onChange={e => setFiltroPagamento(e.target.value)} className="h-11 border px-3 text-sm"><option value="">Todos os pagamentos</option><option value="PAGO">Pago</option><option value="PAGAMENTO_NA_ENTREGA">Pagamento na entrega</option></select><select value={filtroRegiao} onChange={e => setFiltroRegiao(e.target.value)} className="h-11 border px-3 text-sm"><option value="">Todas as regiões</option>{regioes.map(r => <option key={r}>{r}</option>)}</select><label className="flex h-11 items-center gap-2 border px-3 text-sm font-bold"><input type="checkbox" checked={somenteAtrasadas} onChange={e => setSomenteAtrasadas(e.target.checked)}/>Somente atrasadas</label><input aria-label="Data inicial" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-11 border px-3"/><input aria-label="Data final" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-11 border px-3"/><button onClick={() => { setBusca(''); setFiltroStatus(''); setFiltroEntregador(''); setFiltroOrigem(''); setFiltroPagamento(''); setFiltroRegiao(''); setDataInicio(''); setDataFim(''); setSomenteAtrasadas(false); }} className="h-11 border px-3 text-sm font-black">Limpar filtros</button></div></section>
    {modo === 'lista' ? <div className="space-y-7">{grupos.map(g => <section key={g.nome}><h2 className={`mb-3 text-xl font-black ${g.nome === 'Atrasadas' ? 'text-red-700' : ''}`}>{g.nome} <span className="text-sm text-gray-400">({g.itens.length})</span></h2><div className="space-y-3">{g.itens.map(p => <Card key={p.id} pedido={p}/>)}</div></section>)}{!filtrados.length && <div className="bg-white p-10 text-center text-gray-400">Nenhuma entrega encontrada.</div>}</div> : <section className="bg-white p-4 shadow-sm"><header className="mb-4 flex items-center justify-between"><button onClick={() => mudarMes(-1)} className="h-10 border px-4 font-black">←</button><h2 className="text-lg font-black">{primeiro.toLocaleDateString('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'})}</h2><button onClick={() => mudarMes(1)} className="h-10 border px-4 font-black">→</button></header><div className="grid grid-cols-7 gap-1 text-center text-xs font-black text-gray-500">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => <div key={d} className="p-2">{d}</div>)}</div><div className="grid grid-cols-7 gap-1">{celulas.map((dia, i) => { const data = dia ? `${mesCalendario}-${String(dia).padStart(2,'0')}` : ''; const itens = dia ? filtrados.filter(p => dataEntrega(p) === data) : []; return <button key={i} disabled={!dia} onClick={() => { setDataInicio(data); setDataFim(data); setModo('lista'); }} className={`min-h-[76px] border p-2 text-left ${data === dataBrasilia() ? 'border-viva-roxo bg-purple-50' : ''} disabled:border-transparent`}>{dia && <><strong>{dia}</strong>{itens.length > 0 && <span className="mt-2 block bg-viva-verde px-1 text-center text-[10px] font-black">{itens.length} entrega(s)</span>}</>}</button>; })}</div></section>}
  </div>
  {atribuicao && <div className="fixed inset-0 z-[80] flex items-end bg-black/55 md:items-center md:justify-center"><section className="w-full bg-white p-5 md:max-w-lg"><h2 className="text-xl font-black">Atribuir entrega #{atribuicao.pedido.id}</h2><select value={atribuicao.entregadorId} onChange={e => setAtribuicao({...atribuicao,entregadorId:e.target.value})} className="mt-4 h-12 w-full border px-3"><option value="">Sem entregador</option>{entregadores.filter(e => e.ativo && e.user_id).map(e => <option key={e.email} value={e.user_id!}>{e.nome}</option>)}</select><input value={atribuicao.janela} onChange={e => setAtribuicao({...atribuicao,janela:e.target.value})} placeholder="Janela de entrega" className="mt-3 h-12 w-full border px-3"/><textarea value={atribuicao.observacoes} onChange={e => setAtribuicao({...atribuicao,observacoes:e.target.value})} placeholder="Observação" className="mt-3 w-full border p-3"/><div className="mt-5 flex justify-end gap-2"><button onClick={() => setAtribuicao(null)} className="h-11 border px-4 font-black">Fechar</button><button disabled={salvando} onClick={atribuir} className="h-11 bg-viva-verde px-5 font-black text-viva-roxo">Salvar</button></div></section></div>}
  {modalAcao && <div className="fixed inset-0 z-[85] flex items-end bg-black/55 md:items-center md:justify-center"><section className="w-full bg-white p-5 md:max-w-lg"><h2 className="text-xl font-black">{modalAcao.acao === 'tentativa' ? 'Registrar tentativa não concluída' : 'Cancelar entrega'} #{modalAcao.pedido.id}</h2><textarea autoFocus value={modalAcao.observacao} onChange={e => setModalAcao({...modalAcao,observacao:e.target.value})} placeholder="Motivo obrigatório" className="mt-4 w-full border p-3"/><div className="mt-5 flex justify-end gap-2"><button onClick={() => setModalAcao(null)} className="h-11 border px-4 font-black">Voltar</button><button disabled={salvando || modalAcao.observacao.trim().length < 3} onClick={() => executarAcao(modalAcao.pedido,modalAcao.acao,modalAcao.observacao)} className="h-11 bg-red-600 px-5 font-black text-white disabled:opacity-40">Confirmar</button></div></section></div>}
  {confirmacaoAdmin && <div className="fixed inset-0 z-[90] flex items-end bg-black/55 md:items-center md:justify-center"><section className="w-full bg-white p-5 md:max-w-lg"><h2 className="text-xl font-black">Confirmar entrega #{confirmacaoAdmin.pedido.id}</h2><p className="mt-2 text-sm text-gray-600">A confirmação via admin ficará auditada.</p><textarea value={confirmacaoAdmin.observacao} onChange={e => setConfirmacaoAdmin({...confirmacaoAdmin,observacao:e.target.value})} placeholder="Detalhes adicionais" className="mt-4 w-full border p-3"/><div className="mt-5 flex justify-end gap-2"><button onClick={() => setConfirmacaoAdmin(null)} className="h-11 border px-4 font-black">Voltar</button><button disabled={salvando} onClick={confirmarViaAdmin} className="h-11 bg-emerald-600 px-5 font-black text-white">Confirmar entrega</button></div></section></div>}
  </main>;
}
