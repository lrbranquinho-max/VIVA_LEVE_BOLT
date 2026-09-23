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

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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

  if (request.method === 'GET') return json({ publicKey: config?.vapid_public });
  if (!config?.cron_secret || request.headers.get('x-cron-secret') !== config.cron_secret) return json({ error: 'Não autorizado.' }, 401);

  const { data: schedules, error: claimError } = await admin.rpc('claim_due_notification_schedules');
  if (claimError) return json({ error: claimError.message }, 500);
  if (!schedules?.length) return json({ ok: true, processed: 0 });

  webpush.setVapidDetails('mailto:contato@vivalevedf.com.br', config.vapid_public!, config.vapid_private!);

  const [{ data: perfis }, { data: clientes }, { data: subscriptions }] = await Promise.all([
    admin.from('perfis').select('id').limit(10000),
    admin.from('perfis_clientes').select('id').limit(10000),
    admin.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').eq('ativo', true).limit(10000),
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
    const invalidos: string[] = [];
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
    if (invalidos.length) await admin.from('push_subscriptions').update({ ativo: false, atualizado_em: new Date().toISOString() }).in('id', invalidos);
    await admin.from('notification_deliveries').insert({
      schedule_id: schedule.id,
      usuarios_inbox: inboxCount,
      push_enviados: enviados,
      push_falhos: falhos,
      detalhes: { subscriptions: subscriptions?.length || 0, invalidated: invalidos.length },
    });
  }

  return json({ ok: true, processed: schedules.length });
});
