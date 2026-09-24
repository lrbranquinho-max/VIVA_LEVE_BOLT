'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/supabase';

type Tipo = 'semanal' | 'unica';
interface Agendamento {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: Tipo;
  dia_semana: number | null;
  hora: string | null;
  agendada_para: string | null;
  ativa: boolean;
  ultima_execucao_em: string | null;
}
interface EntregaLog {
  id: number;
  schedule_id: string | null;
  executada_em: string;
  usuarios_inbox: number;
  push_enviados: number;
  push_falhos: number;
  fcm_enviados: number;
  fcm_falhos: number;
}

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const INICIAL = { titulo: 'Viva Leve', mensagem: '', tipo: 'semanal' as Tipo, dia_semana: 1, hora: '10:00', agendada_para: '', ativa: true };

function dataLocalInput(iso: string | null) {
  if (!iso) return '';
  const data = new Date(iso);
  const partes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(data);
  const valor = Object.fromEntries(partes.map(item => [item.type, item.value]));
  return `${valor.year}-${valor.month}-${valor.day}T${valor.hour}:${valor.minute}`;
}

export default function AdminNotificacoesPage() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [logs, setLogs] = useState<EntregaLog[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState(INICIAL);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    const { data: usuario } = await supabase.auth.getUser();
    if (!usuario.user) { router.replace('/login'); return; }
    const { data: admin } = await supabase.rpc('is_viva_leve_admin');
    if (!admin) { router.replace('/'); return; }
    const [agenda, entregas] = await Promise.all([
      supabase.from('notification_schedules').select('id,titulo,mensagem,tipo,dia_semana,hora,agendada_para,ativa,ultima_execucao_em').order('criado_em', { ascending: false }),
      supabase.from('notification_deliveries').select('id,schedule_id,executada_em,usuarios_inbox,push_enviados,push_falhos,fcm_enviados,fcm_falhos').order('executada_em', { ascending: false }).limit(20),
    ]);
    if (agenda.error) setErro(agenda.error.message); else setAgendamentos((agenda.data || []) as Agendamento[]);
    if (!entregas.error) setLogs((entregas.data || []) as EntregaLog[]);
    setCarregando(false);
  }, [router]);

  useEffect(() => { carregar(); }, [carregar]);

  function limpar() { setEditando(null); setForm(INICIAL); setErro(''); setSucesso(''); }
  function editar(item: Agendamento) {
    setEditando(item.id);
    setForm({ titulo: item.titulo, mensagem: item.mensagem, tipo: item.tipo, dia_semana: item.dia_semana ?? 1, hora: (item.hora || '10:00').slice(0, 5), agendada_para: dataLocalInput(item.agendada_para), ativa: item.ativa });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function salvar(event: FormEvent) {
    event.preventDefault(); setSalvando(true); setErro(''); setSucesso('');
    try {
      const base = { titulo: form.titulo.trim(), mensagem: form.mensagem.trim(), tipo: form.tipo, ativa: form.ativa };
      const payload = form.tipo === 'semanal'
        ? { ...base, dia_semana: form.dia_semana, hora: `${form.hora}:00`, agendada_para: null }
        : { ...base, dia_semana: null, hora: null, agendada_para: new Date(`${form.agendada_para}:00-03:00`).toISOString() };
      if (payload.mensagem.length < 3) throw new Error('Digite uma mensagem com pelo menos 3 caracteres.');
      if (form.tipo === 'unica' && (!form.agendada_para || new Date(payload.agendada_para!).getTime() <= Date.now())) throw new Error('Escolha uma data e hora futuras.');
      const consulta = editando
        ? supabase.from('notification_schedules').update(payload as any).eq('id', editando)
        : supabase.from('notification_schedules').insert(payload as any);
      const { error } = await consulta;
      if (error) throw error;
      setSucesso(editando ? 'Notificação atualizada.' : 'Notificação programada.');
      setEditando(null); setForm(INICIAL); await carregar();
    } catch (error: any) { setErro(error.message || 'Não foi possível salvar.'); }
    finally { setSalvando(false); }
  }

  async function alternar(item: Agendamento) {
    const { error } = await supabase.from('notification_schedules').update({ ativa: !item.ativa }).eq('id', item.id);
    if (error) setErro(error.message); else await carregar();
  }

  return <main className="min-h-screen bg-gray-100 px-4 py-7">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase text-viva-roxo">Viva Leve Admin</p><h1 className="text-3xl font-black">Notificações</h1><p className="text-sm text-gray-500">Programe um aviso único ou semanal no horário de Brasília.</p></div><Link href="/admin" className="rounded-lg border bg-white px-4 py-3 text-sm font-black text-viva-roxo">Voltar ao Admin</Link></header>
      {erro && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-800">{erro}</p>}
      {sucesso && <p role="status" className="mt-4 rounded-xl bg-green-50 p-4 text-sm font-bold text-green-800">{sucesso}</p>}

      <form onSubmit={salvar} className="mt-6 grid gap-4 rounded-2xl border bg-white p-5 md:grid-cols-2">
        <h2 className="text-xl font-black md:col-span-2">{editando ? 'Editar notificação' : 'Nova notificação'}</h2>
        <label className="text-sm font-bold">Título<input required maxLength={80} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>
        <label className="text-sm font-bold">Tipo<select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as Tipo })} className="mt-1 h-11 w-full rounded-lg border bg-white px-3"><option value="semanal">Semanal</option><option value="unica">Notificação única</option></select></label>
        <label className="text-sm font-bold md:col-span-2">Mensagem<textarea required minLength={3} maxLength={500} rows={4} value={form.mensagem} onChange={e => setForm({ ...form, mensagem: e.target.value })} className="mt-1 w-full rounded-lg border p-3" /></label>
        {form.tipo === 'semanal' ? <><label className="text-sm font-bold">Dia da semana<select value={form.dia_semana} onChange={e => setForm({ ...form, dia_semana: Number(e.target.value) })} className="mt-1 h-11 w-full rounded-lg border bg-white px-3">{DIAS.map((dia, indice) => <option key={dia} value={indice}>{dia}</option>)}</select></label><label className="text-sm font-bold">Hora<input type="time" required value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} className="mt-1 h-11 w-full rounded-lg border px-3" /></label></> : <label className="text-sm font-bold md:col-span-2">Data e hora<input type="datetime-local" required value={form.agendada_para} onChange={e => setForm({ ...form, agendada_para: e.target.value })} className="mt-1 h-11 w-full rounded-lg border px-3" /></label>}
        <label className="flex items-center gap-2 text-sm font-bold md:col-span-2"><input type="checkbox" checked={form.ativa} onChange={e => setForm({ ...form, ativa: e.target.checked })} className="h-5 w-5 accent-viva-roxo" />Ativa</label>
        <div className="flex gap-3 md:col-span-2"><button disabled={salvando} className="rounded-lg bg-viva-roxo px-5 py-3 font-black text-white disabled:opacity-60">{salvando ? 'Salvando...' : 'Salvar programação'}</button>{editando && <button type="button" onClick={limpar} className="rounded-lg border px-5 py-3 font-black">Cancelar edição</button>}</div>
      </form>

      <section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">Programações</h2>{carregando ? <p className="mt-4 text-sm text-gray-500">Carregando...</p> : <div className="mt-4 grid gap-3">{agendamentos.map(item => <article key={item.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black">{item.titulo}</h3><p className="mt-1 text-sm text-gray-700">{item.mensagem}</p><p className="mt-2 text-xs font-bold text-gray-500">{item.tipo === 'semanal' ? `${DIAS[item.dia_semana || 0]} às ${(item.hora || '').slice(0, 5)}` : new Date(item.agendada_para!).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {item.ativa ? 'Ativa' : 'Inativa'}</p></div><div className="flex gap-2"><button type="button" onClick={() => editar(item)} className="rounded-lg border px-3 py-2 text-xs font-black">Editar</button><button type="button" onClick={() => alternar(item)} className={`rounded-lg px-3 py-2 text-xs font-black text-white ${item.ativa ? 'bg-gray-700' : 'bg-emerald-600'}`}>{item.ativa ? 'Desativar' : 'Ativar'}</button></div></div></article>)}{!agendamentos.length && <p className="text-sm text-gray-500">Nenhuma notificação programada.</p>}</div>}</section>

      <section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="text-xl font-black">Últimos disparos</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-gray-500"><th className="p-2">Data</th><th className="p-2">Caixa de entrada</th><th className="p-2">Web Push</th><th className="p-2">Falhas Web</th><th className="p-2">Aplicativo</th><th className="p-2">Falhas App</th></tr></thead><tbody>{logs.map(log => <tr key={log.id} className="border-b"><td className="p-2">{new Date(log.executada_em).toLocaleString('pt-BR')}</td><td className="p-2">{log.usuarios_inbox}</td><td className="p-2">{log.push_enviados}</td><td className="p-2">{log.push_falhos}</td><td className="p-2">{log.fcm_enviados}</td><td className="p-2">{log.fcm_falhos}</td></tr>)}</tbody></table>{!logs.length && <p className="py-4 text-sm text-gray-500">Nenhum disparo registrado.</p>}</div></section>
    </div>
  </main>;
}
