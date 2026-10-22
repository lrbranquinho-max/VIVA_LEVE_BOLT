import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const META_EVENT: Record<string, string> = { store_visit: 'PageView', product_view: 'ViewContent', add_to_cart: 'AddToCart', checkout_started: 'InitiateCheckout', purchase: 'Purchase' };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SITE_URL = 'https://www.vivalevedf.com.br';

function normalize(value: string, phone = false) {
  const result = value.trim().toLowerCase();
  if (!phone) return result;
  const digits = result.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}
async function sha256(value?: string | null, phone = false) {
  if (!value) return undefined;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalize(value, phone)));
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function sourceUrl(page?: string | null, landingPage?: string | null) {
  const value = page || landingPage;
  if (!value) return undefined;
  if (/^https:\/\//i.test(value)) return value;
  return `${SITE_URL}${value.startsWith('/') ? value : `/${value}`}`;
}

function customData(properties: Record<string, unknown> | null | undefined) {
  const data = { ...(properties || {}) };
  delete data.meta_consent;
  if (Array.isArray(data.content_ids)) data.content_ids = data.content_ids.map(String);
  if (Array.isArray(data.content_name)) data.content_name = data.content_name.join(', ');
  return data;
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Supabase não configurado.' }, 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const { data: secrets } = await admin.rpc('get_push_secrets');
  const cronSecret = secrets?.[0]?.cron_secret;
  if (bearer !== serviceKey && (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret)) return json({ error: 'Não autorizado.' }, 401);

  const body = await request.json().catch(() => ({})) as { event_id?: string; drain?: boolean; client_user_agent?: string; client_ip_address?: string };
  if (body.event_id && !UUID_PATTERN.test(body.event_id)) return json({ error: 'Evento inválido.' }, 400);
  const pixelId = Deno.env.get('META_PIXEL_ID')?.trim();
  const accessToken = Deno.env.get('META_CAPI_ACCESS_TOKEN')?.trim();
  const version = Deno.env.get('META_GRAPH_VERSION')?.trim() || 'v26.0';
  const validGraphVersion = /^v\d+\.\d+$/.test(version);
  const testCode = Deno.env.get('META_TEST_EVENT_CODE')?.trim();
  let ids = body.event_id ? [body.event_id] : [];
  if (body.drain || !ids.length) {
    const retryStatuses = pixelId && accessToken && validGraphVersion ? ['pending', 'waiting_configuration', 'error'] : ['pending', 'error'];
    const { data } = await admin.from('meta_capi_entregas').select('event_id').in('status', retryStatuses).lt('tentativas', 6).order('atualizado_em').limit(50);
    ids = (data || []).map(item => item.event_id);
  }
  let sent = 0; let skipped = 0; let errors = 0;

  for (const eventId of ids) {
    const { data: existing } = await admin.from('meta_capi_entregas').select('status,tentativas').eq('event_id', eventId).maybeSingle();
    if (existing?.status === 'sent') { skipped += 1; continue; }
    const { data: event } = await admin.from('loja_eventos').select('event_id,event_name,sessao_id,user_id,pagina,propriedades,ocorrido_em').eq('event_id', eventId).maybeSingle();
    if (!event || !META_EVENT[event.event_name]) { skipped += 1; continue; }
    const consent = event.propriedades?.meta_consent === true;
    await admin.from('meta_capi_entregas').upsert({ event_id: eventId, status: consent ? 'processing' : 'skipped_no_consent', atualizado_em: new Date().toISOString() }, { onConflict: 'event_id' });
    if (!consent) { skipped += 1; continue; }
    if (!pixelId || !accessToken || !validGraphVersion) {
      const reason = validGraphVersion ? 'META_CREDENTIALS_NOT_CONFIGURED' : 'META_GRAPH_VERSION_INVALID';
      await admin.from('meta_capi_entregas').update({ status: 'waiting_configuration', ultimo_erro: reason, atualizado_em: new Date().toISOString() }).eq('event_id', eventId);
      skipped += 1; continue;
    }
    const [{ data: access }, { data: profile }] = await Promise.all([
      event.sessao_id ? admin.from('loja_acessos').select('fbc,fbp,landing_page').eq('sessao_id', event.sessao_id).maybeSingle() : Promise.resolve({ data: null }),
      event.user_id ? admin.from('perfis').select('telefone').eq('id', event.user_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const authUser = event.user_id ? (await admin.auth.admin.getUserById(event.user_id)).data.user : null;
    const userData: Record<string, unknown> = {
      em: await sha256(authUser?.email), ph: await sha256(profile?.telefone, true), external_id: await sha256(event.user_id),
      fbc: access?.fbc || undefined, fbp: access?.fbp || undefined,
      client_user_agent: body.client_user_agent || undefined, client_ip_address: body.client_ip_address || undefined,
    };
    Object.keys(userData).forEach(key => userData[key] === undefined && delete userData[key]);
    const payload: Record<string, unknown> = { data: [{
      event_name: META_EVENT[event.event_name], event_time: Math.floor(new Date(event.ocorrido_em).getTime() / 1000), event_id: event.event_id,
      action_source: 'website', event_source_url: sourceUrl(event.pagina, access?.landing_page),
      user_data: userData, custom_data: customData(event.propriedades),
    }] };
    if (testCode) payload.test_event_code = testCode;
    try {
      const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(pixelId)}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
      });
      const result = await response.json().catch(() => ({}));
      await admin.from('meta_capi_entregas').upsert({
        event_id: eventId, status: response.ok ? 'sent' : 'error', tentativas: Number(existing?.tentativas || 0) + 1, http_status: response.status,
        meta_trace_id: result.fbtrace_id || null, ultimo_erro: response.ok ? null : String(result?.error?.message || 'META_REQUEST_FAILED').slice(0, 500),
        resposta_resumo: { events_received: result.events_received ?? null }, enviado_em: response.ok ? new Date().toISOString() : null, atualizado_em: new Date().toISOString(),
      }, { onConflict: 'event_id' });
      if (response.ok) sent += 1; else errors += 1;
    } catch (error) {
      errors += 1;
      await admin.from('meta_capi_entregas').update({ status: 'error', tentativas: Number(existing?.tentativas || 0) + 1, ultimo_erro: error instanceof Error ? error.message.slice(0, 500) : 'NETWORK_ERROR', atualizado_em: new Date().toISOString() }).eq('event_id', eventId);
    }
  }
  return json({
    ok: true, processed: ids.length, sent, skipped, errors,
    configuration: {
      pixel_id: Boolean(pixelId), capi_access_token: Boolean(accessToken),
      graph_version: validGraphVersion ? version : 'invalid', test_event_code: Boolean(testCode),
    },
  });
});
