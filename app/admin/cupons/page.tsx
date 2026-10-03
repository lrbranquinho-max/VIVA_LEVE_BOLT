'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/supabase';
import { CupomAdmin, SituacaoCupom, situacaoCupom, usuarioEhEquipe } from '@/lib/cuponsAdmin';
import { PerfilUsuario, UsuarioAdmin } from '@/lib/usuariosAdmin';

const PERFIS: Record<PerfilUsuario, string> = { student: 'Cliente', admin: 'Admin', trainer: 'Treinador', delivery: 'Entregador' };
const hojeBrasilia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dataPadrao = () => { const data = new Date(`${hojeBrasilia()}T12:00:00-03:00`); data.setDate(data.getDate() + 30); return data.toISOString().slice(0, 10); };
const moedaPercentual = (valor: number) => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dataHora = (valor?: string | null) => valor ? new Date(valor).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

export default function AdminCuponsPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<UsuarioAdmin[]>([]);
  const [cupons, setCupons] = useState<CupomAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [buscaCliente, setBuscaCliente] = useState('');
  const [clienteSelecionado, setClienteSelecionado] = useState<UsuarioAdmin | null>(null);
  const [percentual, setPercentual] = useState('');
  const [validade, setValidade] = useState(dataPadrao);
  const [buscaCupom, setBuscaCupom] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState<SituacaoCupom | ''>('');
  const [filtroPerfil, setFiltroPerfil] = useState<PerfilUsuario | 'equipe' | ''>('');

  const carregar = useCallback(async () => {
    setAtualizando(true); setErro('');
    try {
      const { data: sessao, error } = await supabase.auth.getSession();
      if (error || !sessao.session) { router.replace('/login'); return; }
      const headers = { Authorization: `Bearer ${sessao.session.access_token}` };
      const [usuariosResponse, cuponsResponse] = await Promise.all([
        fetch('/api/admin/usuarios', { headers, cache: 'no-store' }),
        fetch('/api/admin/cupons', { headers, cache: 'no-store' }),
      ]);
      const [usuariosData, cuponsData] = await Promise.all([usuariosResponse.json(), cuponsResponse.json()]);
      if (!usuariosResponse.ok || !cuponsResponse.ok) {
        if ([usuariosResponse.status, cuponsResponse.status].some(status => status === 401 || status === 403)) router.replace('/login');
        throw new Error(usuariosData.error || cuponsData.error || 'Não foi possível carregar os cupons.');
      }
      setClientes(usuariosData.usuarios ?? []);
      setCupons(cuponsData.cupons ?? []);
    } catch (error: any) { setErro(error.message || 'Não foi possível carregar os cupons.'); }
    finally { setLoading(false); setAtualizando(false); }
  }, [router]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { if (!mensagem) return; const timer = window.setTimeout(() => setMensagem(''), 6000); return () => window.clearTimeout(timer); }, [mensagem]);

  const clientesEncontrados = useMemo(() => {
    const termo = buscaCliente.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    if (termo.length < 2 || clienteSelecionado) return [];
    return clientes.filter(cliente => `${cliente.nome} ${cliente.email}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(termo)).slice(0, 12);
  }, [buscaCliente, clienteSelecionado, clientes]);

  const clientesPorId = useMemo(() => new Map(clientes.map(cliente => [cliente.id, cliente])), [clientes]);
  const contadores = useMemo(() => ({
    ativo: cupons.filter(cupom => situacaoCupom(cupom) === 'ativo').length,
    expirado: cupons.filter(cupom => situacaoCupom(cupom) === 'expirado').length,
    utilizado: cupons.filter(cupom => situacaoCupom(cupom) === 'utilizado').length,
    equipe: cupons.filter(cupom => usuarioEhEquipe(clientesPorId.get(cupom.cliente_id)?.perfis ?? ['student'])).length,
  }), [cupons, clientesPorId]);

  const cuponsFiltrados = useMemo(() => {
    const termo = buscaCupom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return cupons.filter(cupom => {
      const cliente = clientesPorId.get(cupom.cliente_id);
      const texto = `${cupom.id} ${cliente?.nome || ''} ${cliente?.email || ''} ${cupom.percentual_desconto}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const perfilOk = !filtroPerfil || (filtroPerfil === 'equipe' ? usuarioEhEquipe(cliente?.perfis ?? ['student']) : cliente?.perfis.includes(filtroPerfil));
      return (!termo || texto.includes(termo)) && (!filtroSituacao || situacaoCupom(cupom) === filtroSituacao) && perfilOk;
    });
  }, [buscaCupom, clientesPorId, cupons, filtroPerfil, filtroSituacao]);

  async function criarCupom(event: FormEvent) {
    event.preventDefault(); setErro(''); setMensagem('');
    if (!clienteSelecionado) { setErro('Localize e selecione um cliente.'); return; }
    const valor = Number(percentual.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0 || valor > 100) { setErro('Informe um percentual entre 0,01% e 100%.'); return; }
    setSalvando(true);
    try {
      const { data: sessao, error } = await supabase.auth.getSession();
      if (error || !sessao.session) throw new Error('Sessão expirada. Entre novamente.');
      const response = await fetch('/api/admin/cupons', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.session.access_token}` },
        body: JSON.stringify({ clienteId: clienteSelecionado.id, percentual: valor, dataValidade: new Date(`${validade}T23:59:59-03:00`).toISOString() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível criar o cupom.');
      setMensagem(`Cupom de ${moedaPercentual(valor)}% criado para ${clienteSelecionado.nome}.`);
      setBuscaCliente(''); setClienteSelecionado(null); setPercentual(''); setValidade(dataPadrao());
      await carregar();
    } catch (error: any) { setErro(error.message || 'Não foi possível criar o cupom.'); }
    finally { setSalvando(false); }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-gray-100"><div role="status" aria-label="Carregando cupons" className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-viva-roxo" /></div>;

  return <main className="min-h-screen bg-gray-100 p-4 text-gray-900 md:p-7">
    {mensagem && <div role="status" className="fixed left-1/2 top-4 z-[100] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-lg bg-emerald-700 p-3 text-center text-sm font-bold text-white shadow-xl">{mensagem}</div>}
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-viva-verde bg-white p-5"><div><p className="text-xs font-black uppercase text-viva-roxo">Viva Leve Admin</p><h1 className="mt-1 text-2xl font-black">Cupons de desconto</h1><p className="text-sm text-gray-500">Criação por cliente e visão completa do histórico.</p></div><Link href="/admin" className="flex h-11 items-center rounded-lg border bg-white px-4 text-sm font-black text-viva-roxo">Voltar ao Admin</Link></header>
      {erro && <div role="alert" className="mt-4 border-l-4 border-red-500 bg-red-50 p-4 text-sm font-bold text-red-700">{erro}</div>}

      <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(300px,420px)_1fr]">
        <form onSubmit={criarCupom} className="bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Novo cupom</h2><p className="mt-1 text-xs text-gray-500">O cupom será vinculado ao login selecionado.</p>
          <label className="mt-4 block text-xs font-bold text-gray-600">Cliente por nome ou e-mail<input value={buscaCliente} disabled={Boolean(clienteSelecionado)} onChange={event => setBuscaCliente(event.target.value)} placeholder="Digite ao menos 2 caracteres" className="mt-1 h-12 w-full rounded-lg border px-3 text-sm disabled:bg-gray-100" /></label>
          {clientesEncontrados.length > 0 && <div className="mt-1 max-h-64 overflow-y-auto rounded-lg border bg-white shadow-lg">{clientesEncontrados.map(cliente => <button type="button" key={cliente.id} onClick={() => { setClienteSelecionado(cliente); setBuscaCliente(`${cliente.nome} — ${cliente.email}`); }} className="block w-full border-b p-3 text-left hover:bg-purple-50"><span className="block text-sm font-black">{cliente.nome}</span><span className="block break-all text-xs text-gray-500">{cliente.email}</span></button>)}</div>}
          {buscaCliente.trim().length >= 2 && !clienteSelecionado && !clientesEncontrados.length && <p className="mt-2 text-xs text-amber-700">Nenhum cliente encontrado.</p>}
          {clienteSelecionado && <div className="mt-3 rounded-lg bg-purple-50 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-black">{clienteSelecionado.nome}</p><p className="break-all text-xs text-gray-600">{clienteSelecionado.email}</p><div className="mt-2 flex flex-wrap gap-1">{clienteSelecionado.perfis.map(perfil => <span key={perfil} className="rounded bg-white px-2 py-1 text-[10px] font-black text-viva-roxo">{PERFIS[perfil]}</span>)}</div></div><button type="button" onClick={() => { setClienteSelecionado(null); setBuscaCliente(''); }} className="text-xs font-black text-red-700">Trocar</button></div></div>}
          <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-bold text-gray-600">Desconto (%)<input required inputMode="decimal" value={percentual} onChange={event => setPercentual(event.target.value)} placeholder="Ex.: 15" className="mt-1 h-12 w-full rounded-lg border px-3 text-sm" /></label><label className="text-xs font-bold text-gray-600">Validade<input required type="date" min={hojeBrasilia()} value={validade} onChange={event => setValidade(event.target.value)} className="mt-1 h-12 w-full rounded-lg border px-3 text-sm" /></label></div>
          <p className="mt-3 text-xs text-gray-500">Status inicial: <b>aberto</b>. Criação e utilização são registradas automaticamente.</p><button disabled={salvando || !clienteSelecionado} className="mt-4 h-12 w-full rounded-lg bg-viva-verde text-sm font-black text-viva-roxo disabled:opacity-50">{salvando ? 'Criando...' : 'Criar cupom'}</button>
        </form>

        <div className="grid grid-cols-2 gap-3 self-start md:grid-cols-4">{([{ id: 'ativo', label: 'Ativos', valor: contadores.ativo }, { id: 'expirado', label: 'Expirados', valor: contadores.expirado }, { id: 'utilizado', label: 'Utilizados', valor: contadores.utilizado }, { id: 'equipe', label: 'Para equipe', valor: contadores.equipe }] as const).map(item => <button key={item.id} type="button" onClick={() => item.id === 'equipe' ? setFiltroPerfil(atual => atual === 'equipe' ? '' : 'equipe') : setFiltroSituacao(atual => atual === item.id ? '' : item.id)} className="border-l-4 border-viva-roxo bg-white p-4 text-left"><span className="block text-2xl font-black">{item.valor}</span><span className="text-xs font-black text-gray-500">{item.label}</span></button>)}</div>
      </section>

      <section className="mt-5 bg-white"><div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_180px_180px_auto]"><input value={buscaCupom} onChange={event => setBuscaCupom(event.target.value)} placeholder="Cliente, e-mail, ID ou percentual" className="h-11 rounded-lg border px-3 text-sm" /><select value={filtroSituacao} onChange={event => setFiltroSituacao(event.target.value as SituacaoCupom | '')} className="h-11 rounded-lg border px-3 text-sm font-bold"><option value="">Todas as situações</option><option value="ativo">Ativos</option><option value="expirado">Expirados</option><option value="utilizado">Utilizados</option></select><select value={filtroPerfil} onChange={event => setFiltroPerfil(event.target.value as PerfilUsuario | 'equipe' | '')} className="h-11 rounded-lg border px-3 text-sm font-bold"><option value="">Todos os clientes</option><option value="student">Clientes comuns</option><option value="equipe">Toda a equipe</option><option value="admin">Administradores</option><option value="trainer">Treinadores</option><option value="delivery">Entregadores</option></select><button type="button" disabled={atualizando} onClick={() => void carregar()} className="h-11 rounded-lg border border-viva-roxo px-4 text-sm font-black text-viva-roxo disabled:opacity-50">{atualizando ? 'Atualizando...' : 'Atualizar'}</button></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead><tr className="border-b bg-gray-50 text-xs uppercase text-gray-500"><th className="p-3">Cliente</th><th className="p-3">Perfil</th><th className="p-3">Desconto</th><th className="p-3">Situação</th><th className="p-3">Criado em</th><th className="p-3">Validade</th><th className="p-3">Utilização</th><th className="p-3">ID do cupom</th></tr></thead><tbody>{cuponsFiltrados.map(cupom => { const cliente = clientesPorId.get(cupom.cliente_id); const situacao = situacaoCupom(cupom); return <tr key={cupom.id} className="border-b align-top"><td className="p-3"><p className="font-black">{cliente?.nome || 'Cliente não localizado'}</p><p className="break-all text-xs text-gray-500">{cliente?.email || cupom.cliente_id}</p></td><td className="p-3"><div className="flex flex-wrap gap-1">{(cliente?.perfis ?? ['student']).map(perfil => <span key={perfil} className="rounded bg-purple-50 px-2 py-1 text-[10px] font-black text-viva-roxo">{PERFIS[perfil]}</span>)}</div></td><td className="p-3 text-lg font-black text-viva-roxo">{moedaPercentual(cupom.percentual_desconto)}%</td><td className="p-3"><span className={`rounded px-2 py-1 text-xs font-black ${situacao === 'ativo' ? 'bg-emerald-100 text-emerald-800' : situacao === 'expirado' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'}`}>{situacao === 'ativo' ? 'Ativo' : situacao === 'expirado' ? 'Expirado' : 'Utilizado'}</span><p className="mt-1 text-[10px] text-gray-400">Banco: {cupom.status}</p></td><td className="p-3 text-xs">{dataHora(cupom.criado_em)}</td><td className="p-3 text-xs">{dataHora(cupom.data_validade)}</td><td className="p-3 text-xs">{dataHora(cupom.data_utilizacao)}</td><td className="max-w-[180px] break-all p-3 font-mono text-[10px] text-gray-500">{cupom.id}</td></tr>; })}</tbody></table>{!cuponsFiltrados.length && <p className="p-10 text-center text-sm text-gray-500">Nenhum cupom encontrado com estes filtros.</p>}</div>
      </section>
    </div>
  </main>;
}
