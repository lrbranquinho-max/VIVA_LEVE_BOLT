'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/supabase';
import { CompanySettings, companyCssVariables, companyUpdateSchema, formatarCnpj } from '@/lib/company';

type FormState = Omit<CompanySettings, 'id' | 'slug' | 'principal' | 'ativo'>;
type TextKey = keyof FormState;
const sections: Array<{ title: string; fields: Array<[TextKey, string, 'text' | 'email' | 'url' | 'textarea']> }> = [
  { title: 'Institucional', fields: [['nome_fantasia','Nome fantasia','text'],['razao_social','Razão social','text'],['slogan','Slogan','text'],['descricao_empresa','Descrição','textarea'],['texto_sobre','Sobre a empresa','textarea'],['missao','Missão','textarea'],['visao','Visão','textarea'],['mensagem_institucional','Mensagem institucional','textarea'],['descricao_curta_loja','Descrição curta da loja','textarea'],['mensagem_rodape','Mensagem de rodapé','textarea']] },
  { title: 'Fiscal e endereço', fields: [['cnpj','CNPJ','text'],['inscricao_estadual','Inscrição estadual','text'],['inscricao_municipal','Inscrição municipal','text'],['regime_tributario','Regime tributário','text'],['endereco','Logradouro','text'],['numero','Número','text'],['complemento','Complemento','text'],['bairro','Bairro','text'],['cep','CEP','text'],['cidade','Cidade','text'],['uf','UF','text'],['codigo_municipio_ibge','Código IBGE','text'],['pais','País','text']] },
  { title: 'Contatos e redes sociais', fields: [['email','E-mail','email'],['telefone','Telefone','text'],['whatsapp','WhatsApp com DDI','text'],['site','Site','url'],['instagram_url','Instagram','url'],['facebook_url','Facebook','url'],['tiktok_url','TikTok','url'],['youtube_url','YouTube','url'],['linkedin_url','LinkedIn','url']] },
  { title: 'SEO', fields: [['seo_titulo','Título padrão','text'],['seo_descricao','Descrição SEO','textarea'],['seo_nome_empresa','Nome para metadata','text'],['seo_imagem_url','Imagem Open Graph','url']] },
];
const images: Array<[TextKey, string]> = [['logo_url','Logo principal'],['simbolo_url','Símbolo'],['logo_reduzida_url','Logo reduzida'],['favicon_url','Favicon'],['logo_fundo_claro_url','Logo para fundo claro'],['logo_fundo_escuro_url','Logo para fundo escuro'],['imagem_institucional_url','Imagem institucional']];
const colors: Array<[TextKey, string]> = [['cor_primaria','Primária'],['cor_secundaria','Secundária'],['cor_destaque','Destaque'],['cor_fundo','Fundo'],['cor_texto','Texto'],['cor_botao','Botão'],['cor_texto_botao','Texto do botão']];

export default function CompanyAdminPage() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [valuesText, setValuesText] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => { void (async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { router.replace('/login'); return; }
    const response = await fetch('/api/admin/empresa', { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error || 'Não foi possível carregar o cadastro.'); return; }
    const { id, slug, principal, ativo, created_at, updated_at, ...editable } = payload.empresa;
    setCompanyId(id); setForm(editable); setValuesText((editable.valores || []).join('\n'));
  })(); }, [router]);

  const previewStyle = useMemo(() => form ? companyCssVariables(form as CompanySettings) : {}, [form]);
  const setField = (field: TextKey, value: unknown) => setForm(current => current ? { ...current, [field]: value } : current);

  async function upload(field: TextKey, file?: File) {
    if (!file || !form) return;
    setError('');
    const mimeExt: Record<string,string> = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp' };
    const ext = mimeExt[file.type];
    if (!ext) { setError('Use apenas PNG, JPG ou WEBP. SVG não é aceito por segurança.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('A imagem deve ter no máximo 5 MB.'); return; }
    setUploading(String(field));
    try {
      const path = `${companyId}/${String(field)}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('empresa-assets').upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('empresa-assets').getPublicUrl(path);
      setField(field, data.publicUrl);
    } catch (e: any) { setError(e.message || 'Não foi possível enviar a imagem.'); }
    finally { setUploading(null); }
  }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!form) return; setError(''); setMessage('');
    const body = { ...form, valores: valuesText.split(/\r?\n/).map(v => v.trim()).filter(Boolean) };
    const parsed = companyUpdateSchema.safeParse(body);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Revise os campos.'); return; }
    setSaving(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Sessão expirada.');
      const response = await fetch('/api/admin/empresa', { method: 'PATCH', headers: { 'Content-Type':'application/json', Authorization:`Bearer ${data.session.access_token}` }, body: JSON.stringify(parsed.data) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
      const { id, slug, principal, ativo, created_at, updated_at, ...editable } = payload.empresa;
      setForm(editable); setMessage(`${payload.alteracoes} alteração(ões) salva(s). A atualização pública ocorrerá sem novo deploy.`);
    } catch (e: any) { setError(e.message || 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }

  if (!form) return <main className="flex min-h-screen items-center justify-center bg-gray-100"><div className="max-w-lg p-6 text-center">{error || 'Carregando cadastro da empresa...'}</div></main>;
  return <main className="min-h-screen bg-gray-100 p-4 md:p-7"><form onSubmit={save} className="mx-auto max-w-7xl">
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b-4 border-viva-verde bg-white p-5 shadow-sm"><div><p className="text-xs font-black uppercase text-viva-roxo">Configurações</p><h1 className="text-2xl font-black">Cadastro-mestre da empresa</h1><p className="text-sm text-gray-500">Fonte única para site, contatos, identidade e emissão fiscal.</p></div><div className="flex gap-2"><Link href="/admin" className="rounded-lg border px-4 py-3 text-sm font-black">Voltar</Link><button disabled={saving} className="rounded-lg bg-viva-roxo px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar alterações'}</button></div></header>
    {error && <div role="alert" className="mt-4 border-l-4 border-red-500 bg-red-50 p-4 font-bold text-red-700">{error}</div>}{message && <div role="status" className="mt-4 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold text-emerald-800">{message}</div>}
    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">{sections.map(section => <section key={section.title} className="bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-black">{section.title}</h2><div className="grid gap-4 md:grid-cols-2">{section.fields.map(([field,label,type]) => <label key={String(field)} className={`text-xs font-bold text-gray-600 ${type === 'textarea' ? 'md:col-span-2' : ''}`}>{label}{type === 'textarea' ? <textarea value={String(form[field] ?? '')} onChange={e => setField(field,e.target.value)} className="mt-1 min-h-24 w-full rounded-lg border p-3 text-sm" /> : <input type={type} value={field === 'cnpj' ? formatarCnpj(String(form[field] ?? '')) : String(form[field] ?? '')} onChange={e => setField(field,e.target.value)} className="mt-1 h-11 w-full rounded-lg border px-3 text-sm" />}</label>)}</div>{section.title === 'Institucional' && <label className="mt-4 block text-xs font-bold text-gray-600">Valores (um por linha)<textarea value={valuesText} onChange={e => setValuesText(e.target.value)} className="mt-1 min-h-28 w-full rounded-lg border p-3 text-sm" /></label>}</section>)}
      <section className="bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Identidade visual</h2><p className="mt-1 text-xs text-gray-500">PNG, JPG ou WEBP, até 5 MB. Arquivos antigos são preservados para recuperação.</p><div className="mt-4 grid gap-4 md:grid-cols-2">{images.map(([field,label]) => <div key={String(field)} className="rounded-lg border p-3"><p className="text-xs font-black">{label}</p>{form[field] && <img src={String(form[field])} alt={label} className="my-2 h-20 w-full rounded bg-gray-50 object-contain" />}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading === field} onChange={e => void upload(field,e.target.files?.[0])} className="w-full text-xs" /><div className="mt-2 flex gap-2"><input value={String(form[field] ?? '')} onChange={e => setField(field,e.target.value)} placeholder="URL/path" className="h-9 min-w-0 flex-1 rounded border px-2 text-xs" />{form[field] && <button type="button" onClick={() => setField(field,null)} className="text-xs font-bold text-red-700">Remover</button>}</div></div>)}</div><div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{colors.map(([field,label]) => <label key={String(field)} className="text-xs font-bold">{label}<div className="mt-1 flex rounded border"><input type="color" value={String(form[field] || '#000000')} onChange={e => setField(field,e.target.value.toUpperCase())} className="h-10 w-12 border-0" /><input value={String(form[field] || '')} onChange={e => setField(field,e.target.value)} className="min-w-0 flex-1 px-2 text-xs" /></div></label>)}</div></section>
      </div>
      <aside className="lg:sticky lg:top-28 lg:self-start"><div className="overflow-hidden rounded-xl border bg-white shadow-lg" style={previewStyle as React.CSSProperties}><div className="bg-[var(--brand-background)] p-5 text-[var(--brand-text)]"><div className="flex items-center gap-3">{form.logo_url ? <img src={form.logo_url} alt="Preview" className="h-14 w-24 object-contain" /> : <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--brand-primary)] font-black text-white">{form.nome_fantasia.slice(0,2).toUpperCase()}</div>}<div><h2 className="text-lg font-black">{form.nome_fantasia}</h2><p className="text-xs">{form.slogan || 'Seu slogan'}</p></div></div><div className="mt-5 rounded-lg border bg-white p-4"><span className="rounded bg-[var(--brand-accent)] px-2 py-1 text-xs font-black text-[var(--brand-primary)]">Destaque</span><h3 className="mt-3 font-black">Exemplo de card</h3><p className="mt-1 text-sm text-gray-600">{form.descricao_curta_loja || form.descricao_empresa || 'Descrição da empresa.'}</p><button type="button" className="mt-4 rounded-lg bg-[var(--brand-button)] px-4 py-2 font-black text-[var(--brand-button-text)]">Botão de exemplo</button></div></div></div><p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">O preview é local. As alterações só ficam públicas depois de salvar.</p></aside>
    </div>
  </form></main>;
}
