'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/supabase';

interface Notificacao {
  id: string;
  titulo: string;
  mensagem: string;
  criada_em: string;
  lida_em: string | null;
}

function chaveAplicacao(valor: string) {
  const base64 = valor.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(valor.length / 4) * 4, '=');
  const bytes = atob(base64);
  return Uint8Array.from(bytes, caractere => caractere.charCodeAt(0));
}

export default function NotificationCenter() {
  const [userId, setUserId] = useState('');
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<Notificacao[]>([]);
  const [pushAtivo, setPushAtivo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mensagem, setMensagem] = useState('');

  const carregar = useCallback(async (id: string) => {
    const { data } = await supabase.from('notification_inbox').select('id,titulo,mensagem,criada_em,lida_em').eq('user_id', id).order('criada_em', { ascending: false }).limit(30);
    setItens((data || []) as Notificacao[]);
  }, []);

  useEffect(() => {
    let canal: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      await carregar(data.user.id);
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registro = await navigator.serviceWorker.getRegistration().catch(() => undefined);
        setPushAtivo(Boolean(await registro?.pushManager.getSubscription()));
      }
      canal = supabase.channel(`notificacoes-${data.user.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notification_inbox', filter: `user_id=eq.${data.user.id}` }, () => carregar(data.user!.id)).subscribe();
    });
    return () => { if (canal) supabase.removeChannel(canal); };
  }, [carregar]);

  async function ativarPush() {
    if (!userId || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setMensagem('Este navegador não oferece notificações Push.'); return; }
    setBusy(true); setMensagem('');
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') throw new Error('Permissão de notificações não concedida.');
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dispatch-notifications`, { cache: 'no-store' });
      const config = await resposta.json();
      if (!resposta.ok || !config.publicKey) throw new Error('Configuração de notificações indisponível.');
      const registro = await navigator.serviceWorker.ready;
      const atual = await registro.pushManager.getSubscription();
      const subscription = atual || await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveAplicacao(config.publicKey) });
      const serializada = subscription.toJSON();
      const { error } = await supabase.rpc('salvar_push_subscription', {
        p_endpoint: subscription.endpoint,
        p_p256dh: serializada.keys?.p256dh || '',
        p_auth: serializada.keys?.auth || '',
        p_user_agent: navigator.userAgent,
      });
      if (error) throw error;
      setPushAtivo(true); setMensagem('Notificações ativadas neste dispositivo.');
    } catch (error: any) { setMensagem(error.message || 'Não foi possível ativar as notificações.'); }
    finally { setBusy(false); }
  }

  async function marcarComoLidas() {
    const ids = itens.filter(item => !item.lida_em).map(item => item.id);
    if (!ids.length) return;
    const agora = new Date().toISOString();
    const { error } = await supabase.from('notification_inbox').update({ lida_em: agora }).in('id', ids).eq('user_id', userId);
    if (!error) setItens(lista => lista.map(item => ids.includes(item.id) ? { ...item, lida_em: agora } : item));
  }

  if (!userId) return null;
  const naoLidas = itens.filter(item => !item.lida_em).length;
  return <div className="fixed right-4 top-20 z-[70]">
    <button type="button" aria-label={`Notificações${naoLidas ? `, ${naoLidas} não lidas` : ''}`} onClick={() => setAberto(valor => !valor)} className="relative flex h-11 w-11 items-center justify-center rounded-full border border-purple-200 bg-white text-xl shadow-lg">🔔{naoLidas > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-black text-white">{naoLidas}</span>}</button>
    {aberto && <section className="absolute right-0 top-13 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b p-4"><div><h2 className="font-black">Notificações</h2><p className="text-xs text-gray-500">Avisos da Viva Leve</p></div><button type="button" onClick={() => setAberto(false)} className="h-9 w-9 rounded-full bg-gray-100">×</button></header>
      <div className="border-b bg-purple-50 p-3"><button type="button" disabled={busy || pushAtivo} onClick={ativarPush} className="w-full rounded-lg bg-viva-roxo px-3 py-2 text-xs font-black text-white disabled:opacity-60">{pushAtivo ? 'Push ativado neste dispositivo' : busy ? 'Ativando...' : 'Ativar notificações neste dispositivo'}</button>{mensagem && <p role="status" className="mt-2 text-xs text-gray-700">{mensagem}</p>}</div>
      <div className="max-h-[55vh] overflow-y-auto">{itens.map(item => <article key={item.id} className={`border-b p-4 ${item.lida_em ? 'bg-white' : 'bg-emerald-50'}`}><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-black">{item.titulo}</h3>{!item.lida_em && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600"/>}</div><p className="mt-1 text-sm text-gray-700">{item.mensagem}</p><time className="mt-2 block text-[10px] text-gray-400">{new Date(item.criada_em).toLocaleString('pt-BR')}</time></article>)}{!itens.length && <p className="p-6 text-center text-sm text-gray-400">Nenhuma notificação recebida.</p>}</div>
      {naoLidas > 0 && <footer className="p-3"><button type="button" onClick={marcarComoLidas} className="w-full rounded-lg border px-3 py-2 text-xs font-black text-viva-roxo">Marcar todas como lidas</button></footer>}
    </section>}
  </div>;
}
