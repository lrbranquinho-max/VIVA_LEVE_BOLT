'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/supabase';
import { DIAS_PLANO, PlanoConfig, SaborPlano, dataBrasilia, moedaPlano } from '@/lib/planosMarmitas';
import { nomeMeioPagamento } from '@/lib/meiosPagamento';
import PlanosConfiguracao from '@/components/admin/PlanosConfiguracao';
import VoucherPlanoPagamento from '@/components/VoucherPlanoPagamento';

interface Plano {
  id: string; pedido_id: number; nome: string; cliente_nome: string; total_marmitas: number; entregues: number; saldo: number;
  configuracao: PlanoConfig; sabores: SaborPlano[]; status: string; dia_semana: number; proxima_entrega: string | null;
  pagamento_status: string; meio_pagamento: string; voucher_bandeira: string; valor_total: number; endereco_entrega: string;
}
interface Entrega { id: number; entrega_numero: number; entrega_prevista: string; status: string; itens: SaborPlano[]; entrega_janela: string | null; entregador_id: string | null }
interface Evento { id: number; evento: string; criado_em: string; detalhes: Record<string, any> }
const input = 'h-11 min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-sm';
const data = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : '—';

export default function PlanosMarmitasPainel({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [permitido, setPermitido] = useState(false);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [financeiro, setFinanceiro] = useState('');
  const [dia, setDia] = useState('');
  const [proxima, setProxima] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [historico, setHistorico] = useState<Evento[]>([]);
  const [detalheLoading, setDetalheLoading] = useState(false);
  const [codigo, setCodigo] = useState<Record<number, string>>({});
  const [acao, setAcao] = useState<{ plano: string; entrega?: number; tipo: string; data: string; motivo: string } | null>(null);
  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('planos_marmitas_resumo').select('*').order('criado_em', { ascending: false });
    if (error) throw error; setPlanos(data || []);
  }, []);
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) { router.replace('/login'); return; }
        if (admin) { const { data: allowed, error } = await supabase.rpc('is_viva_leve_admin'); if (error) throw error; if (!allowed) { router.replace('/login'); return; } }
        if (!ativo) return; setPermitido(true); await carregar();
      } catch (error: any) { if (ativo) setErro(error.message); }
      finally { if (ativo) setLoading(false); }
    })();
    return () => { ativo = false; };
  }, [admin, carregar, router]);
  const detalheRequisicao = useRef(0);
  const invalidarDetalhe = useCallback(() => { detalheRequisicao.current++; }, []);
  const detalhar = useCallback(async (id: string) => {
    const requisicao = ++detalheRequisicao.current;
    setDetalheLoading(true); setEntregas([]); setHistorico([]); setCodigo({});
    try {
      const [d, h] = await Promise.all([
        supabase.from('pedidos').select('id,entrega_numero,entrega_prevista,status,itens,entrega_janela,entregador_id').eq('plano_id', id).order('entrega_numero'),
        supabase.from('planos_marmitas_historico').select('id,evento,criado_em,detalhes').eq('plano_id', id).order('criado_em', { ascending: false }),
      ]);
      if (d.error) throw d.error; if (h.error) throw h.error;
      if (requisicao !== detalheRequisicao.current) return;
      setEntregas(d.data || []); setHistorico(h.data || []);
    } catch (error: any) { setErro(error.message); } finally { if (requisicao === detalheRequisicao.current) setDetalheLoading(false); }
  }, []);
  useEffect(() => { if (aberto) void detalhar(aberto); return invalidarDetalhe; }, [aberto, detalhar, invalidarDetalhe]);
  const atualizar = useCallback(async () => {
    try { await carregar(); if (aberto) await detalhar(aberto); } catch (error: any) { setErro(error.message); }
  }, [aberto, carregar, detalhar]);
  useEffect(() => { if (!permitido) return; const timer = setInterval(() => void atualizar(), 30000); return () => clearInterval(timer); }, [permitido, atualizar]);
  const filtrados = useMemo(() => planos.filter(p =>
    `${p.nome} ${p.cliente_nome} ${p.pedido_id}`.toLocaleLowerCase().includes(busca.toLocaleLowerCase()) &&
    (!status || status === p.status) && (!financeiro || (financeiro === 'pago' ? p.pagamento_status === 'approved' : p.pagamento_status !== 'approved')) &&
    (!dia || Number(dia) === p.dia_semana) && (!proxima || p.proxima_entrega === proxima)
  ), [planos, busca, status, financeiro, dia, proxima]);
  async function executar() {
    if (!acao || busy) return; setBusy(true); setErro('');
    try {
      const { error } = await supabase.rpc('gerenciar_plano_marmitas', { p_plano_id: acao.plano, p_acao: acao.tipo, p_entrega_id: acao.entrega || null, p_data: acao.data || null, p_motivo: acao.motivo || null });
      if (error) throw error; setAcao(null); await atualizar();
    } catch (error: any) { setErro(error.message); } finally { setBusy(false); }
  }
  async function receber(d: Entrega) {
    if (!window.confirm('Confirma que recebeu esta entrega?')) return; setBusy(true);
    try { const { data, error } = await supabase.rpc('confirmar_entrega_pelo_cliente', { p_pedido_id: d.id }); if (error) throw error; if (!data?.ok) throw new Error(data?.message); await atualizar(); }
    catch (error: any) { setErro(error.message); } finally { setBusy(false); }
  }
  async function verCodigo(d: Entrega) {
    try { const { data, error } = await supabase.rpc('obter_codigo_entrega_cliente', { p_pedido_id: d.id }); if (error) throw error; setCodigo(atual => ({ ...atual, [d.id]: data || '' })); }
    catch (error: any) { setErro(error.message); }
  }
  if (loading) return <p className="p-8" role="status">Carregando planos...</p>;
  if (!permitido) return <p role="alert" className="p-8">{erro || 'Acesso não autorizado.'}</p>;
  return <main className="min-h-screen bg-gray-50 p-4 pb-24 text-gray-900 md:p-7"><div className="mx-auto max-w-6xl">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b-4 border-viva-verde pb-4"><h1 className="text-2xl font-black text-viva-roxo">{admin ? 'Planos / Kits vendidos' : 'Meus Planos'}</h1><div className="flex gap-3"><button onClick={atualizar} className="rounded-lg border px-3 py-2 text-sm font-bold">Atualizar</button><Link href={admin ? '/admin' : '/perfil'} className="rounded-lg border px-3 py-2 text-sm font-bold">Voltar</Link></div></header>
    {erro && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
    {admin && <PlanosConfiguracao />}
    <div className="my-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <input aria-label="Buscar plano ou cliente" placeholder="Plano, cliente ou pedido" value={busca} onChange={e => setBusca(e.target.value)} className={input} />
      <select aria-label="Status do plano" value={status} onChange={e => setStatus(e.target.value)} className={input}><option value="">Todos os status</option>{['Aguardando pagamento', 'Ativo', 'Suspenso', 'Concluído', 'Cancelado'].map(s => <option key={s}>{s}</option>)}</select>
      <select aria-label="Status financeiro" value={financeiro} onChange={e => setFinanceiro(e.target.value)} className={input}><option value="">Todos os pagamentos</option><option value="pago">Pago</option><option value="pendente">Pendente / não pago</option></select>
      <select aria-label="Dia da semana" value={dia} onChange={e => setDia(e.target.value)} className={input}><option value="">Qualquer dia</option>{DIAS_PLANO.slice(1).map((s, i) => <option key={s} value={i + 1}>{s}</option>)}</select>
      <input aria-label="Próxima entrega" type="date" value={proxima} onChange={e => setProxima(e.target.value)} className={input} />
    </div>
    <div className="space-y-4">{filtrados.map(p => <article key={p.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button type="button" onClick={() => setAberto(aberto === p.id ? null : p.id)} aria-expanded={aberto === p.id} className="w-full p-4 text-left">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs text-gray-500">Pedido #{p.pedido_id}{admin ? ` · ${p.cliente_nome}` : ''}</p><h2 className="mt-1 text-lg font-black">{p.nome}</h2></div><span className="rounded bg-purple-50 px-2 py-1 text-xs font-bold text-viva-roxo">{p.status}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><p><b>{p.entregues} de {p.total_marmitas}</b><span className="block text-sm text-gray-600">{p.saldo} marmitas restantes</span></p><p><b>{p.pagamento_status === 'approved' ? 'Pago' : 'Pagamento pendente'}</b><span className="block text-sm text-gray-600">{nomeMeioPagamento(p.meio_pagamento)}</span></p><p><b>{data(p.proxima_entrega)}</b><span className="block text-sm text-gray-600">Próxima entrega · {DIAS_PLANO[p.dia_semana]}</span></p></div>
        <progress max={p.total_marmitas} value={p.entregues} aria-label="Marmitas entregues" className="mt-4 h-2 w-full accent-viva-roxo" />
      </button>
      {aberto === p.id && <section className="space-y-4 border-t p-4">
        <div className="grid gap-4 md:grid-cols-2"><div><h3 className="text-sm font-black">Sabores contratados</h3>{p.sabores.map(s => <p key={s.id} className="mt-1 text-sm">{s.quantidade} × {s.nome}</p>)}</div><div><h3 className="text-sm font-black">Endereço de entrega</h3><p className="mt-1 text-sm">{p.endereco_entrega}</p><p className="mt-2 text-sm font-bold">Total do pedido: {moedaPlano(p.valor_total)}</p></div></div>
        {p.pagamento_status !== 'approved' && !admin && <Link href="/pedidos" className="inline-block rounded-lg bg-viva-roxo px-4 py-3 text-sm font-bold text-white">Pagar pelo aplicativo</Link>}
        {detalheLoading ? <p role="status">Carregando entregas...</p> : <div className="divide-y border-y">{entregas.map(d => <div key={d.id} className="py-4">
          <div className="flex flex-wrap justify-between gap-2"><p className="font-bold">Entrega {d.entrega_numero} · {data(d.entrega_prevista)}</p><span className="text-sm font-bold text-viva-roxo">{d.status === 'Recebido' ? 'Aguardando preparação' : d.status}{d.entregador_id && !['Entregue', 'Saiu para Entrega', 'Cancelado'].includes(d.status) ? ' · Atribuída' : ''}</span></div>
          <p className="mt-1 text-xs text-gray-600">{d.itens.map(s => `${s.quantidade} × ${s.nome}`).join(' · ')}</p>{d.entrega_janela && <p className="mt-1 text-sm">Horário: {d.entrega_janela}</p>}
          {admin && !['Entregue', 'Cancelado'].includes(d.status) && <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/admin/entregas?pedido=${d.id}`} className="rounded border px-3 py-2 text-xs font-bold">Entrega / atribuir entregador</Link>
            {(['preparar', 'pronta', 'reprogramar', 'cancelar_entrega'] as const).map(tipo => <button key={tipo} onClick={() => setAcao({ plano: p.id, entrega: d.id, tipo, data: tipo === 'reprogramar' ? d.entrega_prevista : '', motivo: '' })} className="rounded border px-3 py-2 text-xs font-bold">{{ preparar: 'Em preparação', pronta: 'Pronta', reprogramar: 'Reprogramar', cancelar_entrega: 'Cancelar entrega' }[tipo]}</button>)}
          </div>}
          {admin && d.entrega_numero === 1 && p.meio_pagamento === 'voucher_presencial' && p.pagamento_status !== 'approved' && p.status !== 'Cancelado' && <div className="mt-3"><VoucherPlanoPagamento entregaId={d.id} valor={p.valor_total} bandeira={p.voucher_bandeira} onSaved={atualizar} /></div>}
          {!admin && d.status === 'Saiu para Entrega' && <div className="mt-3 flex flex-wrap items-center gap-2"><button onClick={() => verCodigo(d)} className="rounded border px-3 py-3 text-sm font-bold">Ver código</button>{codigo[d.id] && <strong className="font-mono text-xl">{codigo[d.id]}</strong>}<button disabled={busy} onClick={() => receber(d)} className="rounded bg-viva-verde px-3 py-3 text-sm font-bold text-viva-roxo disabled:opacity-40">Recebi meu pedido</button></div>}
        </div>)}</div>}
        <details><summary className="cursor-pointer text-sm font-bold">Histórico do plano</summary><ol className="mt-3 space-y-2">{historico.map(h => <li key={h.id} className="text-xs text-gray-600"><b>{new Date(h.criado_em).toLocaleString('pt-BR')}</b> · {h.evento.replaceAll('_', ' ')}{h.detalhes.novo ? `: ${h.detalhes.novo}` : ''}{h.detalhes.status ? `: ${h.detalhes.status}` : ''}{h.detalhes.motivo ? ` · ${h.detalhes.motivo}` : ''}{h.detalhes.nova_data ? ` · ${data(h.detalhes.nova_data)}` : ''}{h.detalhes.referencia ? ` · ${h.detalhes.referencia}` : ''}</li>)}</ol></details>
        {admin && !['Cancelado','Concluído'].includes(p.status) && <button onClick={() => setAcao({ plano: p.id, tipo: 'cancelar', data: '', motivo: '' })} className="rounded border border-red-300 px-4 py-2 text-sm font-bold text-red-700">Cancelar plano</button>}
      </section>}
    </article>)}</div>
    {!filtrados.length && <p className="py-12 text-center text-gray-500">Nenhum plano encontrado.</p>}
    {acao && <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/50 p-4"><form role="dialog" aria-modal="true" aria-label="Alterar plano" onSubmit={e => { e.preventDefault(); void executar(); }} className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl">
      <h2 className="text-lg font-black">{acao.tipo.replaceAll('_', ' ')}</h2>
      {acao.tipo === 'reprogramar' && <label className="block text-sm font-bold">Nova data<input required type="date" min={dataBrasilia()} value={acao.data} onChange={e => setAcao({ ...acao, data: e.target.value })} className={`${input} mt-1 w-full`} /></label>}
      {['cancelar', 'cancelar_entrega', 'reprogramar'].includes(acao.tipo) && <label className="block text-sm font-bold">Motivo<textarea required minLength={3} maxLength={1000} value={acao.motivo} onChange={e => setAcao({ ...acao, motivo: e.target.value })} className="mt-1 w-full rounded border p-3" /></label>}
      {acao.tipo.startsWith('cancelar') && <p className="text-sm text-amber-900">O histórico será preservado. Reembolso e reposição de estoque devem ser avaliados separadamente.</p>}
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setAcao(null)} className="h-11 rounded border px-3">Voltar</button><button disabled={busy} className="h-11 rounded bg-viva-verde px-3 font-bold text-viva-roxo">{busy ? 'Salvando...' : 'Confirmar'}</button></div>
    </form></div>}
  </div></main>;
}
