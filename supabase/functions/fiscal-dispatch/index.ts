import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { createFiscalProvider } from './provider.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
type AnyRecord = Record<string, any>;

function unique(values: string[]) { return [...new Set(values)]; }
function readiness(snapshot: AnyRecord, type: 'nfe' | 'nfce') {
  const missing: string[] = [];
  if (!snapshot.emitente?.cnpj) missing.push('CNPJ da empresa');
  if (!snapshot.emitente?.razao_social) missing.push('razao social da empresa');
  if (!snapshot.emitente?.uf) missing.push('UF da empresa');
  if (!snapshot.emitente?.codigo_municipio) missing.push('codigo IBGE da empresa');
  const items = Array.isArray(snapshot.pedido?.itens) ? snapshot.pedido.itens : [];
  if (!items.length) missing.push('itens do pedido');
  for (const item of items) {
    const tax = snapshot.produtos_fiscais?.[String(item.id)] || {};
    if (!tax.ncm) missing.push(`NCM de ${item.nome || item.id}`);
    if (type === 'nfe' && !tax.cfop) missing.push(`CFOP de ${item.nome || item.id}`);
  }
  if (type === 'nfe' && !snapshot.destinatario?.nome) missing.push('nome do destinatario');
  return unique(missing);
}

function paymentMethod(value?: string) {
  const method = String(value || '').toLowerCase();
  if (method.includes('pix')) return 'pix';
  if (method.includes('voucher') || method.includes('aliment')) return 'vale_alimentacao';
  if (method.includes('debito')) return 'debito';
  if (method.includes('credito') || method.includes('card') || method.includes('cielo') || method.includes('mercado')) return 'credito';
  if (method.includes('dinheiro')) return 'dinheiro';
  return 'outro';
}

function buildItems(snapshot: AnyRecord, type: 'nfe' | 'nfce') {
  const source = snapshot.pedido.itens as AnyRecord[];
  const totalGross = source.reduce((sum, item) => sum + Number(item.subtotal ?? Number(item.preco || 0) * Number(item.quantidade || 1)), 0);
  const discount = Math.max(0, Number(snapshot.pedido.desconto || 0));
  let allocated = 0;
  return source.map((item, index) => {
    const tax = snapshot.produtos_fiscais?.[String(item.id)] || {};
    const quantity = Number(item.quantidade || 1);
    const gross = Number(item.subtotal ?? Number(item.preco || 0) * quantity);
    const itemDiscount = index === source.length - 1 ? Math.max(0, discount - allocated) : Math.round((totalGross ? discount * gross / totalGross : 0) * 100) / 100;
    allocated += itemDiscount;
    const result: AnyRecord = {
      descricao: String(item.nome || `Produto ${item.id}`).slice(0, 300), ncm: tax.ncm, quantidade: quantity,
      valor_unitario: Number(item.preco ?? (quantity ? gross / quantity : gross)), valor_total: gross,
      valor_desconto: itemDiscount, codigo_produto: String(item.id), unidade: tax.unidade || 'UN',
      origem: tax.origem || '0', gtin: tax.gtin || undefined, cest: tax.cest || undefined,
      cst_icms: tax.cst || undefined, csosn: tax.csosn || undefined, aliquota_icms: tax.aliquota_icms ?? undefined,
      ...(tax.extras || {}),
    };
    if (type === 'nfe' || tax.cfop) result.cfop = tax.cfop || '5102';
    Object.keys(result).forEach(key => result[key] == null && delete result[key]);
    return result;
  });
}

function buildPayload(document: AnyRecord) {
  const snapshot = document.payload_snapshot;
  const type = document.tipo_documento as 'nfe' | 'nfce';
  const items = buildItems(snapshot, type);
  const emitterRef = document.fiscal_configuracoes?.provider_emitter_ref;
  const common: AnyRecord = { itens: items, idempotency_key: document.idempotency_key,
    emitter_id: emitterRef && /^\d+$/.test(emitterRef) ? Number(emitterRef) : undefined,
    emitter_cnpj: !emitterRef || /^\d+$/.test(emitterRef) ? undefined : emitterRef };
  if (type === 'nfce') {
    const customer = snapshot.destinatario || {};
    return { ...common, pagamentos: [{ forma: paymentMethod(snapshot.pedido.meio_pagamento), valor: Number(document.valor_total) }],
      consumidor: customer.cpf_cnpj ? { cpf_cnpj: customer.cpf_cnpj, nome: customer.nome, email: customer.email } : undefined,
      desconto_total: Number(snapshot.pedido.desconto || 0), informacoes_adicionais: `Pedido ${snapshot.emitente?.nome_fantasia || 'Loja'} #${snapshot.pedido.id}` };
  }
  const customer = snapshot.destinatario || {};
  return { ...common, destinatario: {
    nome: customer.nome, cpf_cnpj: customer.cpf_cnpj || undefined, indicador_ie: customer.indicador_ie || '9',
    inscricao_estadual: customer.inscricao_estadual || undefined, email: customer.email || undefined,
    logradouro: customer.logradouro || undefined, numero: customer.numero || undefined, complemento: customer.complemento || undefined,
    bairro: customer.bairro || undefined, municipio: customer.municipio || undefined, codigo_municipio: customer.codigo_municipio || undefined,
    uf: customer.uf || undefined, cep: customer.cep || undefined, consumidor_final: true,
  }, frete: { modalidade: '0', valor: Number(snapshot.pedido.frete || 0) },
  pagamento: { forma: paymentMethod(snapshot.pedido.meio_pagamento) === 'pix' ? '17' : '03', valor: Number(document.valor_total) },
  informacoes_adicionais: `Pedido ${snapshot.emitente?.nome_fantasia || 'Loja'} #${snapshot.pedido.id}` };
}

async function hmacValid(raw: string, header: string | null, secret: string) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(part => part.split('=', 2)));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !parts.v1) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`));
  const actual = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual.length !== parts.v1.length) return false;
  let diff = 0; for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase nao configurado.' }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const raw = await request.text();
  const isWebhook = new URL(request.url).searchParams.get('webhook') === 'dotcompany';
  if (isWebhook) {
    const secret = Deno.env.get('DOTCOMPANY_WEBHOOK_SECRET') || '';
    if (!await hmacValid(raw, request.headers.get('x-webhook-signature-256'), secret)) return json({ error: 'Assinatura invalida.' }, 401);
    const payload = JSON.parse(raw || '{}') as AnyRecord;
    const eventId = String(payload.event_id || ''); const type = String(payload.event || payload.type || 'unknown'); const data = payload.data || payload;
    if (!eventId) return json({ error: 'event_id ausente.' }, 400);
    const providerId = String(data.nota_id || data.document_id || '');
    const { data: doc } = providerId ? await admin.from('documentos_fiscais').select('id,status').eq('provider_document_id', providerId).maybeSingle() : { data: null };
    const status = /cancel/i.test(type) ? 'cancelled' : /autoriz/i.test(type) ? 'authorized' : /rejeit/i.test(type) ? 'rejected' : null;
    await admin.from('fiscal_webhook_eventos').upsert({ event_id: eventId, tipo: type, documento_fiscal_id: doc?.id || null,
      payload_resumo: { nota_id: providerId || null, status: data.status || null }, processado_em: new Date().toISOString() }, { onConflict: 'event_id', ignoreDuplicates: true });
    if (doc && status && doc.status !== 'cancelled') await admin.from('documentos_fiscais').update({ status, atualizado_em: new Date().toISOString(),
      ...(status === 'authorized' ? { autorizado_em: new Date().toISOString() } : {}), ...(status === 'cancelled' ? { cancelado_em: new Date().toISOString() } : {}) }).eq('id', doc.id);
    return json({ ok: true });
  }

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const { data: secrets } = await admin.rpc('get_push_secrets'); const cronSecret = secrets?.[0]?.cron_secret;
  if (bearer !== serviceKey && (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret)) return json({ error: 'Nao autorizado.' }, 401);
  const body = JSON.parse(raw || '{}') as { action?: 'drain' | 'process' | 'cancel'; document_id?: string; justification?: string };

  if (body.action === 'cancel') {
    const token = Deno.env.get('DOTCOMPANY_API_TOKEN')?.trim();
    if (!token) return json({ error: 'DOTCOMPANY_API_TOKEN_NOT_CONFIGURED' }, 503);
    if (!body.document_id || !body.justification || body.justification.trim().length < 15) return json({ error: 'Documento e justificativa de 15 a 255 caracteres sao obrigatorios.' }, 400);
    const { data: doc } = await admin.from('documentos_fiscais').select('*,fiscal_configuracoes(*)').eq('id', body.document_id).eq('status', 'authorized').maybeSingle();
    if (!doc?.provider_document_id) return json({ error: 'Documento autorizado nao encontrado.' }, 404);
    const cancelKey = crypto.randomUUID();
    const provider = createFiscalProvider(doc.fiscal_configuracoes?.provedor || doc.provedor, token);
    const response = await provider.cancel(doc.provider_document_id, body.justification.trim(), cancelKey); const result = response.body;
    if (!response.ok || !result.success) return json({ error: String(result.message || 'Cancelamento recusado.'), code: response.headers.get('x-error-code') }, response.status || 422);
    await admin.from('documentos_fiscais').update({ status: 'cancelled', protocolo: result.protocolo || doc.protocolo, cancelado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', doc.id);
    await admin.from('fiscal_eventos').insert({ documento_fiscal_id: doc.id, evento: 'cancelled', detalhes: { protocolo: result.protocolo || null, ja_cancelada: Boolean(result.ja_cancelada) } });
    return json({ ok: true, status: 'cancelled' });
  }

  let ids = body.document_id ? [body.document_id] : [];
  if (body.action === 'drain' || !ids.length) {
    const { data } = await admin.from('documentos_fiscais').select('id').in('status', ['pending','error']).or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${new Date().toISOString()}`).order('solicitado_em').limit(20);
    ids = (data || []).map(item => item.id);
  }
  if (!ids.length) return json({ ok: true, processed: 0, authorized: 0, rejected: 0, errors: 0, skipped: 0, environment: 'server-side' });
  const token = Deno.env.get('DOTCOMPANY_API_TOKEN')?.trim();
  if (!token) return json({ error: 'DOTCOMPANY_API_TOKEN_NOT_CONFIGURED' }, 503);
  let authorized = 0; let rejected = 0; let errors = 0; let skipped = 0;
  for (const id of ids) {
    const { data: document } = await admin.from('documentos_fiscais').select('*,fiscal_configuracoes(*)').eq('id', id).in('status', ['pending','error']).maybeSingle();
    if (!document) { skipped += 1; continue; }
    const config = document.fiscal_configuracoes;
    if (!config?.ativo || config.modo === 'disabled') {
      await admin.from('documentos_fiscais').update({ status: 'error', codigo_erro: 'FISCAL_MODULE_DISABLED', mensagem_erro: 'Modulo fiscal desabilitado.', proxima_tentativa_em: null, atualizado_em: new Date().toISOString() }).eq('id', id);
      skipped += 1; continue;
    }
    if ((document.ambiente === 'homologacao' && !token.startsWith('dc_test_')) || (document.ambiente === 'producao' && !token.startsWith('dc_live_'))) {
      await admin.from('documentos_fiscais').update({ status: 'error', codigo_erro: 'DOTCOMPANY_TOKEN_ENVIRONMENT_MISMATCH', mensagem_erro: 'Token nao corresponde ao ambiente configurado.', proxima_tentativa_em: null, atualizado_em: new Date().toISOString() }).eq('id', id);
      errors += 1; continue;
    }
    const missing = readiness(document.payload_snapshot, document.tipo_documento);
    if (missing.length) {
      await admin.from('documentos_fiscais').update({ status: 'error', codigo_erro: 'FISCAL_DATA_INCOMPLETE', mensagem_erro: `Dados fiscais pendentes: ${missing.join(', ')}`.slice(0,1000), proxima_tentativa_em: null, atualizado_em: new Date().toISOString() }).eq('id', id);
      errors += 1; continue;
    }
    const attempt = Number(document.tentativas || 0) + 1;
    const { data: claimed } = await admin.from('documentos_fiscais').update({ status: 'processing', tentativas: attempt, processando_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', id).in('status', ['pending','error']).select('id').maybeSingle();
    if (!claimed) { skipped += 1; continue; }
    await admin.from('fiscal_eventos').insert({ documento_fiscal_id: id, evento: 'processing', detalhes: { tentativa: attempt } });
    try {
      const payload = buildPayload(document); Object.keys(payload).forEach(key => payload[key] == null && delete payload[key]);
      const provider = createFiscalProvider(config.provedor, token);
      const response = await provider.issue(document.tipo_documento, document.ambiente, document.idempotency_key, payload); const result = response.body;
      const transient = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!response.ok) {
        const canRetry = transient && attempt < Number(config.max_tentativas || 4);
        const next = canRetry ? new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000).toISOString() : null;
        await admin.from('documentos_fiscais').update({ status: canRetry ? 'error' : (response.status === 422 ? 'rejected' : 'error'),
          codigo_erro: response.headers.get('x-error-code') || result?.error?.code || 'DOTCOMPANY_REQUEST_FAILED',
          mensagem_erro: String(result?.error?.message || result.message || 'Falha na API fiscal.').slice(0,1000), proxima_tentativa_em: next, atualizado_em: new Date().toISOString() }).eq('id', id);
        await admin.from('fiscal_eventos').insert({ documento_fiscal_id: id, evento: canRetry ? 'retry_scheduled' : (response.status === 422 ? 'rejected' : 'error'), detalhes: { http_status: response.status, tentativa: attempt, proxima_tentativa_em: next } });
        if (response.status === 422) rejected += 1; else errors += 1; continue;
      }
      const finalStatus = result.autorizada === true ? 'authorized' : result.pendente === true ? 'processing' : 'rejected';
      let xmlPath: string | null = null; let danfePath: string | null = null;
      if (finalStatus === 'authorized' && !result.xml_autorizado && result.nota_id) {
        try { const file=await provider.downloadXml(String(result.nota_id)); if(file.ok)result.xml_autorizado=file.body.xml; } catch { /* arquivo pode ser consultado depois */ }
      }
      if (finalStatus === 'authorized' && !result.danfe_pdf_base64 && result.nota_id) {
        try { const file=await provider.downloadDanfe(String(result.nota_id),crypto.randomUUID()); if(file.ok)result.danfe_pdf_base64=file.body.conteudo_base64; } catch { /* emissão autorizada não falha por download */ }
      }
      if (finalStatus === 'authorized' && result.xml_autorizado) {
        xmlPath = `${document.empresa_id}/${document.id}/documento.xml`;
        await admin.storage.from('documentos-fiscais').upload(xmlPath, new Blob([String(result.xml_autorizado)], { type: 'application/xml' }), { upsert: true, contentType: 'application/xml' });
      }
      if (finalStatus === 'authorized' && result.danfe_pdf_base64) {
        danfePath = `${document.empresa_id}/${document.id}/danfe.pdf`;
        const bytes = Uint8Array.from(atob(String(result.danfe_pdf_base64)), char => char.charCodeAt(0));
        await admin.storage.from('documentos-fiscais').upload(danfePath, bytes, { upsert: true, contentType: 'application/pdf' });
      }
      await admin.from('documentos_fiscais').update({ status: finalStatus, provider_document_id: result.nota_id == null ? null : String(result.nota_id),
        numero: result.numero || null, serie: result.serie || null, chave_acesso: result.chave_acesso || null, protocolo: result.protocolo || null,
        xml_storage_path: xmlPath, danfe_storage_path: danfePath, codigo_erro: result.erro?.codigo == null ? null : String(result.erro.codigo),
        mensagem_erro: finalStatus === 'authorized' ? null : String(result.message || 'Documento rejeitado.').slice(0,1000),
        resposta_resumo: { success: Boolean(result.success), autorizada: Boolean(result.autorizada), status: result.status || null, message: result.message || null, billing: result.billing || null },
        proxima_tentativa_em: null, autorizado_em: finalStatus === 'authorized' ? new Date().toISOString() : null, atualizado_em: new Date().toISOString() }).eq('id', id);
      await admin.from('fiscal_eventos').insert({ documento_fiscal_id: id, evento: finalStatus, detalhes: { tentativa: attempt, provider_document_id: result.nota_id || null } });
      if (finalStatus === 'authorized') authorized += 1; else if (finalStatus === 'rejected') rejected += 1;
    } catch (error) {
      const canRetry = attempt < Number(config.max_tentativas || 4); const next = canRetry ? new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000).toISOString() : null;
      await admin.from('documentos_fiscais').update({ status: 'error', codigo_erro: 'DOTCOMPANY_NETWORK_ERROR', mensagem_erro: error instanceof Error ? error.message.slice(0,1000) : 'Falha de rede.', proxima_tentativa_em: next, atualizado_em: new Date().toISOString() }).eq('id', id);
      await admin.from('fiscal_eventos').insert({ documento_fiscal_id: id, evento: canRetry ? 'retry_scheduled' : 'error', detalhes: { tentativa: attempt, proxima_tentativa_em: next } }); errors += 1;
    }
  }
  return json({ ok: true, processed: ids.length, authorized, rejected, errors, skipped, environment: 'server-side' });
});
