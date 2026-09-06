'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/supabase';
import { PremiumPlan, PremiumResource, resourceNames } from '@/lib/premium/domain';

type AuditRow = { id: string; action: string; entity: string; created_at: string; origin: string };
type Partner = { id: string; name: string; active: boolean; duration_days: number; partner_type: string };
type Settings = { commercial_enabled: boolean; enforcement_enabled: boolean; purchase_reward_enabled: boolean };
const emptyPlan = (): PremiumPlan => ({ code: '', name: '', description: '', price_cents: 0,
  duration_days: 30, resources: [], active: true, highlighted: false, renewable: true, display_order: 0, promotional_text: '' });
const fieldClass = 'w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900';

export default function PremiumAdminPage() {
  const [plans, setPlans] = useState<PremiumPlan[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<PremiumPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [authorized, setAuthorized] = useState(false);

  const api = useCallback(async (method = 'GET', body?: PremiumPlan) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setAuthorized(false); throw new Error('Entre com uma conta administrativa para continuar.'); }
    const response = await fetch('/api/admin/premium', { method, cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) {
      if ([401, 403].includes(response.status)) { setAuthorized(false); setPlans([]); setPartners([]); setAudit([]); setSettings(null); }
      throw new Error(result.error || 'Não foi possível carregar os planos.');
    }
    setAuthorized(true);
    return result;
  }, []);
  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api();
      setPlans(data.plans); setPartners(data.partners); setAudit(data.audit); setSettings(data.settings);
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao carregar.'); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  function edit(plan: PremiumPlan) {
    // Send only writable schema fields, never timestamps returned by the database.
    setForm({ id: plan.id, version: plan.version, code: plan.code, name: plan.name, description: plan.description,
      price_cents: plan.price_cents, duration_days: plan.duration_days, resources: plan.resources,
      active: plan.active, highlighted: plan.highlighted, renewable: plan.renewable,
      display_order: plan.display_order, promotional_text: plan.promotional_text });
    setMessage(''); setError('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || saving) return;
    setSaving(true); setError(''); setMessage('');
    try { await api('POST', form); setForm(null); setMessage('Plano salvo e alteração registrada na auditoria.'); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Falha ao salvar.'); }
    finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/admin" className="font-bold text-viva-roxo">← Voltar ao Admin</Link>
      <header><p className="text-sm font-bold uppercase tracking-widest text-viva-roxo">Viva Leve</p>
        <h1 className="text-3xl font-black">Planos & Benefícios</h1>
        <p className="mt-2 text-slate-600">Planos digitais de Dieta e Treino. Independentes dos kits de marmitas.</p></header>
      {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}
        {!authorized && <Link href="/login" className="ml-2 underline">Entrar</Link>}</div>}
      {message && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{message}</p>}
      {loading ? <p role="status">Carregando configuração…</p> : authorized && <>
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold">Implantação gradual — etapa de configuração</h2>
          <p className="mt-2 text-sm">Checkout, importações e bloqueios premium ainda não estão disponíveis nesta etapa. A configuração abaixo não altera compras ou acessos atuais.</p>
          <p className="mt-2 text-sm">Venda: {settings?.commercial_enabled ? 'ativada no banco' : 'desativada'} · Proteção comercial: {settings?.enforcement_enabled ? 'ativada no banco' : 'desativada'} · Recompensa por compra: {settings?.purchase_reward_enabled ? 'ativada no banco' : 'desativada'}</p>
        </section>
        <section aria-labelledby="plans-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="plans-title" className="text-xl font-bold">Planos</h2>
            <button onClick={() => { setForm(emptyPlan()); setMessage(''); }} className="rounded-xl bg-viva-roxo px-5 py-3 font-bold text-white">Novo plano</button></div>
          <div className="grid gap-4 md:grid-cols-3">{plans.map(plan => <article key={plan.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${plan.highlighted ? 'border-viva-roxo' : 'border-slate-200'}`}>
            <div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-bold">{plan.name}</h3><span className="text-sm">{plan.active ? 'Ativo' : 'Inativo'}</span></div>
            <p className="my-3 text-2xl font-black">{(plan.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<span className="text-sm font-normal"> / {plan.duration_days} dias</span></p>
            <p className="text-sm text-slate-600">{plan.description}</p>
            <ul className="my-4 space-y-1 text-sm">{plan.resources.map(resource => <li key={resource}>✓ {resourceNames[resource] || resource}</li>)}</ul>
            <p className="mb-3 text-sm font-semibold text-viva-roxo">{plan.promotional_text}</p>
            <button onClick={() => edit(plan)} className="rounded-lg border border-viva-roxo px-4 py-2 font-bold text-viva-roxo">Editar {plan.name}</button>
          </article>)}</div>
        </section>
        {form && <section className="rounded-2xl border bg-white p-6" aria-labelledby="form-title">
          <h2 id="form-title" className="mb-4 text-xl font-bold">{form.id ? 'Editar plano' : 'Novo plano'}</h2>
          <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
            <label>Código interno<input className={fieldClass} required pattern="[a-z][a-z0-9_]{1,49}" disabled={Boolean(form.id) || saving} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></label>
            <label>Nome<input className={fieldClass} required maxLength={120} disabled={saving} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label>Preço (R$)<input className={fieldClass} type="number" min="0" step="0.01" required disabled={saving} value={form.price_cents / 100} onChange={e => setForm({ ...form, price_cents: Math.round(Number(e.target.value) * 100) })} /></label>
            <label>Duração (dias)<input className={fieldClass} type="number" min="1" max="3660" required disabled={saving} value={form.duration_days} onChange={e => setForm({ ...form, duration_days: Number(e.target.value) })} /></label>
            <label className="md:col-span-2">Descrição<textarea className={fieldClass} maxLength={4000} disabled={saving} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
            <label>Texto promocional<input className={fieldClass} maxLength={1000} disabled={saving} value={form.promotional_text} onChange={e => setForm({ ...form, promotional_text: e.target.value })} /></label>
            <label>Ordem de exibição<input className={fieldClass} type="number" min="0" max="10000" required disabled={saving} value={form.display_order} onChange={e => setForm({ ...form, display_order: Number(e.target.value) })} /></label>
            <fieldset className="space-y-2"><legend className="font-bold">Recursos liberados</legend>{Object.entries(resourceNames).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" disabled={saving} checked={form.resources.includes(key as PremiumResource)} onChange={e => setForm({ ...form, resources: e.target.checked ? [...form.resources, key as PremiumResource] : form.resources.filter(r => r !== key) })} />{label}</label>)}</fieldset>
            <fieldset className="space-y-2"><legend className="font-bold">Exibição e renovação</legend>{([['active', 'Ativo'], ['highlighted', 'Destaque comercial'], ['renewable', 'Permite renovação']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" disabled={saving} checked={form[key]} onChange={e => setForm({ ...form, [key]: e.target.checked })} />{label}</label>)}</fieldset>
            <div className="flex gap-3 md:col-span-2"><button disabled={saving || !form.resources.length} className="rounded-xl bg-viva-roxo px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? 'Salvando…' : 'Salvar plano'}</button>
              <button type="button" disabled={saving} onClick={() => setForm(null)} className="rounded-xl border px-5 py-3">Cancelar edição</button></div>
          </form>
        </section>}
        <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Parceiros configurados</h2>
          <p className="mt-1 text-sm text-slate-600">Consulta inicial. Gestão e importações serão disponibilizadas na próxima etapa.</p>
          {partners.map(partner => <p key={partner.id} className="mt-3">{partner.name} · {partner.partner_type} · {partner.duration_days} dias · {partner.active ? 'Ativo' : 'Inativo'}</p>)}</section>
        <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Auditoria recente</h2><p className="text-sm text-slate-600">Até 100 eventos mais recentes.</p>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Data</th><th className="p-2">Ação</th><th className="p-2">Entidade</th><th className="p-2">Origem</th></tr></thead>
            <tbody>{audit.map(row => <tr key={row.id} className="border-t"><td className="p-2">{new Date(row.created_at).toLocaleString('pt-BR')}</td><td className="p-2">{row.action}</td><td className="p-2">{row.entity}</td><td className="p-2">{row.origin}</td></tr>)}</tbody></table></div></section>
      </>}
    </div>
  </main>;
}
