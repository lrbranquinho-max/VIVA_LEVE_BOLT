'use client';
import Link from 'next/link';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import {supabase} from '@/supabase';
import {remainingDays,resourceNames} from '@/lib/premium/domain';

export default function MeuPlanoPage(){
  const router=useRouter(); const [data,setData]=useState<any>(null); const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{const {data:session}=await supabase.auth.getSession(); if(!session.session){router.replace('/login?next=/meu-plano');return;}
    const response=await fetch('/api/premium/me',{cache:'no-store',headers:{Authorization:`Bearer ${session.session.access_token}`}}); const result=await response.json();
    if(!response.ok) throw new Error(result.error||'Não foi possível carregar seu plano.'); setData(result);},[router]);
  useEffect(()=>{load().catch(e=>setError(e.message)).finally(()=>setLoading(false));},[load]);
  const active=useMemo(()=>data?.grants?.filter((g:any)=>['ACTIVE','REVIEW_REQUIRED'].includes(g.status)&&Date.parse(g.expires_at)>Date.now())||[],[data]);
  async function subscribe(planId:string){try{setError(''); const {data:session}=await supabase.auth.getSession(); const response=await fetch('/api/premium/checkout',{method:'POST',headers:{Authorization:`Bearer ${session.session?.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({planId,idempotencyKey:crypto.randomUUID()})}); const result=await response.json(); if(!response.ok)throw new Error(result.error); const url=result.initPoint||result.sandboxInitPoint; if(url)window.location.assign(url);}catch(e){setError(e instanceof Error?e.message:'Falha ao iniciar pagamento.');}}
  return <main className="mx-auto min-h-screen max-w-4xl bg-slate-50 px-4 py-8 pb-28"><Link href="/perfil" className="font-bold text-viva-roxo">← Voltar</Link><h1 className="mt-4 text-3xl font-black">Meu Plano</h1>
    {loading&&<p className="mt-6">Carregando…</p>}{error&&<p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {data&&<><section className="mt-6 grid gap-4 md:grid-cols-2">{active.length?active.map((g:any)=>{const partner=data.partners?.find((p:any)=>p.id===g.partner_id);return <article key={g.id} className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">{g.plan_snapshot.name}</h2><p className="mt-2 font-semibold text-green-700">Ativo por mais {remainingDays(g.expires_at)} dias</p><p>Vencimento: {new Date(g.expires_at).toLocaleDateString('pt-BR')}</p><p>Origem: {partner?`Benefício — ${partner.name}`:g.source_type==='SUBSCRIPTION'?'Assinatura':'Benefício Viva Leve'}</p><ul className="mt-3 text-sm">{g.plan_snapshot.resources.map((r:keyof typeof resourceNames)=><li key={r}>✓ {resourceNames[r]||r}</li>)}</ul></article>}):<div className="rounded-2xl bg-white p-6"><h2 className="text-xl font-bold">Você ainda não possui plano ativo</h2><p className="mt-2 text-slate-600">Libere Dieta Premium e Treino por assinatura, compra qualificada, Grupo VIP ou parceiros.</p></div>}</section>
      <section className="mt-8"><h2 className="text-2xl font-black">Planos disponíveis</h2><div className="mt-4 grid gap-4 md:grid-cols-3">{data.plans.map((p:any)=><article key={p.id} className={`rounded-2xl border bg-white p-5 ${p.highlighted?'border-viva-roxo ring-2 ring-purple-100':''}`}><h3 className="text-lg font-bold">{p.name}</h3><p className="my-2 text-2xl font-black">{(p.price_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}<span className="text-sm font-normal"> / {p.duration_days} dias</span></p><p className="text-sm">{p.description}</p><button disabled={!data.settings.commercial_enabled} onClick={()=>subscribe(p.id)} className="mt-4 w-full rounded-xl bg-viva-roxo p-3 font-bold text-white disabled:bg-slate-300">{data.settings.commercial_enabled?'ASSINAR AGORA':'EM BREVE'}</button></article>)}</div>
      <p className="mt-5 rounded-xl bg-green-50 p-4 text-green-900">Compras a partir de {(data.settings.purchase_minimum_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}, incluindo o frete efetivamente pago, podem liberar 30 dias do Plano Completo.</p></section></>}
    <BottomNav active="perfil"/></main>;
}
