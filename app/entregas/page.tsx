'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { nomeMeioPagamento } from '@/lib/meiosPagamento';
import { supabase } from '@/supabase';

interface Entrega {
  id: number;
  status: string;
  endereco_entrega: string | null;
  endereco: string | null;
  endereco_complemento: string | null;
  endereco_referencia: string | null;
  itens: Array<{ nome: string; quantidade: number; preco?: number }>;
  criado_em: string | null;
  entrega_atribuida_em: string | null;
  saiu_entrega_em: string | null;
  entregue_em: string | null;
  entrega_observacoes: string | null;
  entrega_janela: string | null;
  meio_pagamento: string | null;
  pagamento_status: string | null;
  cliente_nome: string;
  cliente_telefone: string;
}

type Grupo = 'pendentes' | 'rota' | 'entregues';

function grupoEntrega(entrega: Entrega): Grupo {
  if (entrega.status === 'Entregue') return 'entregues';
  if (entrega.status === 'Saiu para Entrega') return 'rota';
  return 'pendentes';
}

function somenteDigitos(valor: string) { return valor.replace(/\D/g, ''); }

export default function EntregasPage() {
  const router = useRouter();
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [grupo, setGrupo] = useState<Grupo>('pendentes');
  const [aberta, setAberta] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState<Entrega | null>(null);
  const [codigo, setCodigo] = useState('');
  const [mensagem, setMensagem] = useState<{ texto: string; erro?: boolean } | null>(null);

  const avisar = useCallback((texto: string, erro = false) => {
    setMensagem({ texto, erro });
    window.setTimeout(() => setMensagem(null), 5000);
  }, []);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('listar_minhas_entregas');
    if (error) { avisar(`Erro ao carregar entregas: ${error.message}`, true); return; }
    setEntregas(Array.isArray(data) ? data as Entrega[] : []);
  }, [avisar]);

  useEffect(() => {
    let ativo = true;
    async function iniciar() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace('/login'); return; }
      const { data: permitido } = await supabase.rpc('is_viva_leve_delivery');
      if (!permitido) { router.replace('/login'); return; }
      await carregar();
      if (ativo) setLoading(false);
    }
    iniciar();
    const timer = window.setInterval(() => { if (ativo) carregar(); }, 30000);
    return () => { ativo = false; window.clearInterval(timer); };
  }, [carregar, router]);

  const filtradas = useMemo(() => entregas.filter(item => grupoEntrega(item) === grupo), [entregas, grupo]);
  const totais = useMemo(() => ({
    pendentes: entregas.filter(item => grupoEntrega(item) === 'pendentes').length,
    rota: entregas.filter(item => grupoEntrega(item) === 'rota').length,
    entregues: entregas.filter(item => grupoEntrega(item) === 'entregues').length,
  }), [entregas]);

  async function iniciarEntrega(entrega: Entrega) {
    if (!window.confirm(`Iniciar a rota do pedido #${entrega.id}? O cliente receberá um código de confirmação no aplicativo.`)) return;
    setAtualizando(entrega.id);
    const { error } = await supabase.rpc('iniciar_entrega_pedido', { p_pedido_id: entrega.id });
    setAtualizando(null);
    if (error) { avisar(error.message, true); return; }
    avisar('Entrega iniciada. O código já está disponível para o cliente.');
    setGrupo('rota'); await carregar();
  }

  async function confirmarCodigo() {
    if (!confirmando || codigo.length < 4) { avisar('Digite o código informado pelo cliente.', true); return; }
    setAtualizando(confirmando.id);
    const { data, error } = await supabase.rpc('confirmar_entrega_por_codigo', { p_pedido_id: confirmando.id, p_codigo: codigo });
    setAtualizando(null);
    if (error) { avisar(error.message, true); return; }
    const resposta = data as { ok?: boolean; message?: string } | null;
    if (!resposta?.ok) { avisar(resposta?.message || 'Código de confirmação inválido.', true); return; }
    avisar(resposta.message || 'Entrega confirmada com sucesso.');
    setConfirmando(null); setCodigo(''); setGrupo('entregues'); await carregar();
  }

  async function sair() { await supabase.auth.signOut(); router.replace('/login'); }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-gray-100"><div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-viva-roxo" /></div>;

  return (
    <main className="min-h-screen bg-gray-100 pb-8 text-gray-900">
      {mensagem && <div className={`fixed left-3 right-3 top-3 z-[100] mx-auto max-w-md px-4 py-3 text-center text-sm font-black text-white shadow-xl ${mensagem.erro ? 'bg-red-600' : 'bg-emerald-600'}`}>{mensagem.texto}</div>}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-28"><Logo /></div><div><p className="text-xs font-black uppercase text-viva-roxo">Módulo de Entregas</p><h1 className="font-black">Entregas de hoje</h1></div></div><button onClick={sair} className="h-10 border border-gray-300 px-3 text-xs font-black text-gray-600">Sair</button></div>
      </header>

      <div className="mx-auto max-w-2xl p-3 sm:p-4">
        <nav className="mb-4 grid grid-cols-3 gap-2" aria-label="Status das entregas">
          {([['pendentes', 'Pendentes'], ['rota', 'Em rota'], ['entregues', 'Entregues']] as [Grupo, string][]).map(([id, label]) => <button key={id} onClick={() => setGrupo(id)} className={`min-h-[3.5rem] px-2 text-xs font-black ${grupo === id ? 'bg-viva-roxo text-white' : 'bg-white text-gray-600'}`}><span className="block text-lg">{totais[id]}</span>{label}</button>)}
        </nav>

        <div className="space-y-3">
          {filtradas.map(entrega => {
            const detalhes = aberta === entrega.id;
            const endereco = entrega.endereco_entrega || entrega.endereco || 'Endereço não informado';
            const telefone = somenteDigitos(entrega.cliente_telefone || '');
            const emRota = grupoEntrega(entrega) === 'rota';
            return <article key={entrega.id} className={`overflow-hidden bg-white shadow-sm ${emRota ? 'border-l-4 border-viva-roxo' : 'border-l-4 border-gray-300'}`}>
              <button onClick={() => setAberta(detalhes ? null : entrega.id)} className="w-full p-4 text-left"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-black text-gray-400">PEDIDO #{entrega.id}</p><h2 className="mt-1 truncate text-lg font-black">{entrega.cliente_nome}</h2><p className="mt-1 line-clamp-2 text-sm font-bold text-gray-600">{endereco}</p>{entrega.entrega_janela && <p className="mt-1 text-xs font-black text-viva-roxo">Janela: {entrega.entrega_janela}</p>}</div><span className={`shrink-0 px-2 py-1 text-[10px] font-black uppercase ${emRota ? 'bg-purple-100 text-purple-800' : entrega.status === 'Entregue' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{entrega.status === 'Saiu para Entrega' ? 'Em rota' : entrega.status === 'Entregue' ? 'Entregue' : 'Atribuída'}</span></div><p className="mt-3 text-right text-xs font-bold text-gray-400">{detalhes ? 'Ocultar detalhes' : 'Ver detalhes'}</p></button>

              {detalhes && <div className="space-y-4 border-t border-gray-100 bg-gray-50 p-4">
                <section><p className="text-xs font-black uppercase text-gray-400">Cliente e contato</p><p className="mt-1 font-black">{entrega.cliente_nome}</p><div className="mt-2 flex flex-wrap gap-2">{telefone && <><a href={`tel:+${telefone}`} className="flex h-11 items-center bg-gray-900 px-4 text-sm font-black text-white">Ligar</a><a href={`https://wa.me/${telefone}`} target="_blank" rel="noreferrer" className="flex h-11 items-center bg-[#25D366] px-4 text-sm font-black text-white">WhatsApp</a></>}</div></section>
                <section><p className="text-xs font-black uppercase text-gray-400">Endereço completo</p><p className="mt-1 text-sm font-bold text-gray-700">{endereco}</p>{entrega.endereco_complemento && <p className="text-sm text-gray-600">Complemento: {entrega.endereco_complemento}</p>}{entrega.endereco_referencia && <p className="text-sm text-gray-600">Referência: {entrega.endereco_referencia}</p>}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex h-11 items-center border border-viva-roxo px-4 text-sm font-black text-viva-roxo">Abrir no mapa</a></section>
                {entrega.entrega_observacoes && <section className="border-l-4 border-amber-400 bg-amber-50 p-3"><p className="text-xs font-black uppercase text-amber-700">Observação da entrega</p><p className="mt-1 text-sm font-bold text-amber-900">{entrega.entrega_observacoes}</p></section>}
                <section><p className="text-xs font-black uppercase text-gray-400">Resumo dos itens</p><div className="mt-2 space-y-1">{(entrega.itens || []).map((item, index) => <div key={`${item.nome}-${index}`} className="flex justify-between bg-white px-3 py-2 text-sm"><span className="font-bold">{item.nome}</span><span className="font-black">{item.quantidade}x</span></div>)}</div></section>
                <section className="bg-white p-3"><p className="text-xs font-black uppercase text-gray-400">Pagamento</p><p className="mt-1 text-sm font-black">{entrega.pagamento_status === 'approved' || entrega.pagamento_status === 'pago' || entrega.pagamento_status === 'balcao' ? 'Pagamento realizado' : 'Pagamento na entrega'}</p><p className="text-xs text-gray-500">{nomeMeioPagamento(entrega.meio_pagamento)} · {entrega.pagamento_status || 'status não informado'}</p></section>
              </div>}

              {entrega.status !== 'Entregue' && <footer className="border-t border-gray-100 p-3">{emRota ? <button onClick={() => { setConfirmando(entrega); setCodigo(''); }} className="h-14 w-full bg-viva-verde text-base font-black text-viva-roxo">Confirmar entrega</button> : <button disabled={atualizando === entrega.id} onClick={() => iniciarEntrega(entrega)} className="h-14 w-full bg-viva-roxo text-base font-black text-white disabled:opacity-50">{atualizando === entrega.id ? 'Iniciando...' : 'Saiu para entrega'}</button>}</footer>}
            </article>;
          })}
          {!filtradas.length && <div className="bg-white px-4 py-12 text-center"><p className="text-4xl">✓</p><p className="mt-3 font-black text-gray-500">Nenhuma entrega nesta lista.</p></div>}
        </div>
      </div>

      {confirmando && <div className="fixed inset-0 z-[80] flex items-end bg-black/60 md:items-center md:justify-center md:p-4"><section className="w-full bg-white p-5 shadow-2xl md:max-w-md"><p className="text-xs font-black uppercase text-viva-roxo">Pedido #{confirmando.id}</p><h2 className="mt-1 text-xl font-black">Confirmar entrega</h2><p className="mt-2 text-sm text-gray-600">Digite o código de seis dígitos informado pelo cliente.</p><input autoFocus inputMode="numeric" maxLength={6} value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-5 h-16 w-full border-2 border-gray-300 text-center font-mono text-3xl font-black tracking-[0.35em] outline-none focus:border-viva-roxo" placeholder="000000" /><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => setConfirmando(null)} className="h-12 border border-gray-300 text-sm font-black">Cancelar</button><button disabled={atualizando === confirmando.id || codigo.length !== 6} onClick={confirmarCodigo} className="h-12 bg-viva-verde text-sm font-black text-viva-roxo disabled:opacity-40">Validar código</button></div></section></div>}
    </main>
  );
}
