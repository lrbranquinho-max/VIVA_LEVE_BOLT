import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

let fcmCache: { token: string; expiresAt: number } | null = null;

function base64Url(valor: string | Uint8Array) {
  const bytes = typeof valor === 'string' ? new TextEncoder().encode(valor) : valor;
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function accessTokenFirebase(serviceAccountRaw: string) {
  if (fcmCache && fcmCache.expiresAt > Date.now() + 60_000) return fcmCache.token;
  const conta = JSON.parse(serviceAccountRaw) as { client_email?: string; private_key?: string; token_uri?: string };
  if (!conta.client_email || !conta.private_key) throw new Error('Credencial Firebase incompleta.');
  const agora = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ iss: conta.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: conta.token_uri || 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 }));
  const chaveBase64 = conta.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const chaveBinaria = Uint8Array.from(atob(chaveBase64), caractere => caractere.charCodeAt(0));
  const chave = await crypto.subtle.importKey('pkcs8', chaveBinaria, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(`${header}.${payload}`)));
  const assertion = `${header}.${payload}.${base64Url(assinatura)}`;
  const resposta = await fetch(conta.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const corpo = await resposta.json();
  if (!resposta.ok || !corpo.access_token) throw new Error('Não foi possível autenticar o envio Firebase.');
  fcmCache = { token: corpo.access_token, expiresAt: Date.now() + Number(corpo.expires_in || 3600) * 1000 };
  return fcmCache.token;
}

async function enviarFirebase(serviceAccountRaw: string, projectId: string, token: string, titulo: string, mensagem: string) {
  const accessToken = await accessTokenFirebase(serviceAccountRaw);
  const resposta = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title: titulo, body: mensagem }, data: { url: '/' }, android: { priority: 'normal', notification: { channel_id: 'viva_leve_avisos', sound: 'default' } } } }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  return { ok: resposta.ok, invalido: resposta.status === 404 || JSON.stringify(corpo).includes('UNREGISTERED') };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const firebaseServiceAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  let firebaseProjectId = Deno.env.get('FIREBASE_PROJECT_ID');
  if (firebaseServiceAccount && !firebaseProjectId) {
    try { firebaseProjectId = JSON.parse(firebaseServiceAccount).project_id; } catch { /* validado no envio */ }
  }
  if (!supabaseUrl || !serviceKey) return json({ error: 'Função não configurada.' }, 500);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let { data: secrets, error: secretsError } = await admin.rpc('get_push_secrets');
  if (secretsError) return json({ error: 'Não foi possível carregar a configuração Push.' }, 500);

  let config = secrets?.[0] as { vapid_public?: string; vapid_private?: string; cron_secret?: string } | undefined;
  if (!config?.vapid_public || !config.vapid_private || !config.cron_secret) {
    const vapid = webpush.generateVAPIDKeys();
    const { error } = await admin.rpc('bootstrap_push_secrets', {
      p_public: vapid.publicKey,
      p_private: vapid.privateKey,
      p_cron: randomSecret(),
    });
    if (error) return json({ error: 'Não foi possível inicializar as chaves Push.' }, 500);
    const result = await admin.rpc('get_push_secrets');
    if (result.error) return json({ error: 'Não foi possível confirmar as chaves Push.' }, 500);
    config = result.data?.[0];
  }

  if (request.method === 'GET') return json({ publicKey: config?.vapid_public, nativePushConfigured: Boolean(firebaseServiceAccount && firebaseProjectId) });
  if (!config?.cron_secret || request.headers.get('x-cron-secret') !== config.cron_secret) return json({ error: 'Não autorizado.' }, 401);

  const { data: schedules, error: claimError } = await admin.rpc('claim_due_notification_schedules');
  if (claimError) return json({ error: claimError.message }, 500);
  if (!schedules?.length) return json({ ok: true, processed: 0 });

  webpush.setVapidDetails('mailto:contato@vivalevedf.com.br', config.vapid_public!, config.vapid_private!);

  const [{ data: perfis }, { data: clientes }, { data: subscriptions }, { data: nativeTokens }] = await Promise.all([
    admin.from('perfis').select('id').limit(10000),
    admin.from('perfis_clientes').select('id').limit(10000),
    admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').eq('ativo', true).limit(10000),
    admin.from('native_push_tokens').select('id,user_id,token,plataforma').eq('ativo', true).limit(10000),
  ]);
  const usuarios = Array.from(new Set([...(perfis || []), ...(clientes || [])].map(item => item.id)));

  for (const schedule of schedules) {
    const inbox = usuarios.map(userId => ({
      schedule_id: schedule.id,
      user_id: userId,
      titulo: schedule.titulo,
      mensagem: schedule.mensagem,
      referencia_data: schedule.referencia_data,
    }));
    let inboxCount = 0;
    if (inbox.length) {
      const { data } = await admin.from('notification_inbox').upsert(inbox, { onConflict: 'schedule_id,user_id,referencia_data', ignoreDuplicates: true }).select('id');
      inboxCount = data?.length || 0;
    }

    let enviados = 0;
    let falhos = 0;
    let fcmEnviados = 0;
    let fcmFalhos = 0;
    const invalidos: string[] = [];
    const nativosInvalidos: string[] = [];
    const payload = JSON.stringify({
      title: schedule.titulo,
      body: schedule.mensagem,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      url: '/',
      tag: `viva-leve-${schedule.id}-${schedule.referencia_data}`,
    });

    for (let index = 0; index < (subscriptions || []).length; index += 25) {
      const lote = (subscriptions || []).slice(index, index + 25);
      await Promise.all(lote.map(async subscription => {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, payload, { TTL: 24 * 60 * 60, urgency: 'normal' });
          enviados += 1;
        } catch (error: any) {
          falhos += 1;
          if ([404, 410].includes(Number(error?.statusCode))) invalidos.push(subscription.id);
        }
      }));
    }
    if (firebaseServiceAccount && firebaseProjectId) {
      for (let index = 0; index < (nativeTokens || []).length; index += 25) {
        const lote = (nativeTokens || []).slice(index, index + 25);
        await Promise.all(lote.map(async dispositivo => {
          try {
            const resultado = await enviarFirebase(firebaseServiceAccount, firebaseProjectId!, dispositivo.token, schedule.titulo, schedule.mensagem);
            if (resultado.ok) fcmEnviados += 1;
            else { fcmFalhos += 1; if (resultado.invalido) nativosInvalidos.push(dispositivo.id); }
          } catch { fcmFalhos += 1; }
        }));
      }
    }
    if (invalidos.length) await admin.from('push_subscriptions').update({ ativo: false, atualizado_em: new Date().toISOString() }).in('id', invalidos);
    if (nativosInvalidos.length) await admin.from('native_push_tokens').update({ ativo: false, atualizado_em: new Date().toISOString() }).in('id', nativosInvalidos);
    await admin.from('notification_deliveries').insert({
      schedule_id: schedule.id,
      usuarios_inbox: inboxCount,
      push_enviados: enviados,
      push_falhos: falhos,
      fcm_enviados: fcmEnviados,
      fcm_falhos: fcmFalhos,
      detalhes: { subscriptions: subscriptions?.length || 0, native_tokens: nativeTokens?.length || 0, invalidated: invalidos.length, native_invalidated: nativosInvalidos.length, fcm_configured: Boolean(firebaseServiceAccount && firebaseProjectId) },
    });
  }

  return json({ ok: true, processed: schedules.length });
});
