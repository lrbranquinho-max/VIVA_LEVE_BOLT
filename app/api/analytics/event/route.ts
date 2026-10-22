import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { criarSupabaseAdmin } from '@/lib/supabaseAdmin';
import { authenticatedUser, invokeMetaConversions } from '@/lib/metaConversionsServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const attribution = z.object({
  utm_source: z.string().max(300).optional(), utm_medium: z.string().max(300).optional(),
  utm_campaign: z.string().max(500).optional(), utm_content: z.string().max(500).optional(),
  utm_term: z.string().max(500).optional(), fbclid: z.string().max(1000).optional(),
  fbc: z.string().max(1000).optional(), fbp: z.string().max(1000).optional(),
  referrer: z.string().max(2000).optional(), landing_page: z.string().max(2000).optional(),
}).strict();
const eventProperties = z.object({
  value: z.number().finite().nonnegative().max(1_000_000).optional(), currency: z.literal('BRL').optional(),
  content_ids: z.array(z.union([z.string().max(100), z.number().int()])).max(100).optional(),
  content_name: z.union([z.string().max(500), z.array(z.string().max(500)).max(100)]).optional(),
  content_type: z.literal('product').optional(), quantity: z.number().int().nonnegative().max(10_000).optional(),
  num_items: z.number().int().nonnegative().max(10_000).optional(), payment_method: z.string().max(100).optional(),
  original_price: z.number().finite().nonnegative().max(1_000_000).optional(),
  discount_percent: z.number().finite().min(0).max(100).optional(),
  final_price: z.number().finite().nonnegative().max(1_000_000).optional(),
  discount_campaign: z.string().max(100).optional(), discount_coupon_id: z.string().uuid().optional(),
  has_discount: z.boolean().optional(),
}).strict();
const schema = z.object({
  eventId: z.string().uuid(),
  eventName: z.enum(['store_visit', 'product_impression', 'product_click', 'product_view', 'add_to_cart', 'checkout_started', 'payment_started', 'purchase', 'whatsapp_click', 'instagram_click']),
  sessaoId: z.string().uuid(), firstTouch: attribution, lastTouch: attribution,
  metaConsent: z.boolean(), produtoId: z.number().int().positive().optional(), pedidoId: z.number().int().positive().optional(),
  pagina: z.string().max(2000).optional(), propriedades: eventProperties.default({}),
}).strict();

export async function POST(request: NextRequest) {
  try {
    if (Number(request.headers.get('content-length') || 0) > 32_768) return NextResponse.json({ error: 'Evento excede o limite permitido.' }, { status: 413 });
    const input = schema.parse(await request.json());
    if (input.eventName === 'purchase') return NextResponse.json({ error: 'Purchase é registrado exclusivamente pelo backend de pagamento.' }, { status: 403 });
    const admin = criarSupabaseAdmin();
    const user = await authenticatedUser(request.headers.get('authorization'));
    const { data: existing } = await admin.from('loja_acessos').select('sessao_id,first_touch').eq('sessao_id', input.sessaoId).maybeSingle();
    const touch = input.lastTouch;
    const access = {
      sessao_id: input.sessaoId, user_id: user?.id || null,
      utm_source: touch.utm_source || null, utm_medium: touch.utm_medium || null, utm_campaign: touch.utm_campaign || null,
      utm_content: touch.utm_content || null, utm_term: touch.utm_term || null, fbclid: touch.fbclid || null,
      fbc: touch.fbc || null, fbp: touch.fbp || null, referrer: touch.referrer || null,
      landing_page: input.firstTouch.landing_page || null, ultima_pagina: input.pagina || null,
      first_touch: existing?.first_touch && Object.keys(existing.first_touch).length ? existing.first_touch : input.firstTouch,
      last_touch: input.lastTouch, meta_consent: input.metaConsent, atualizado_em: new Date().toISOString(),
    };
    const { error: accessError } = await admin.from('loja_acessos').upsert(access, { onConflict: 'sessao_id' });
    if (accessError) throw accessError;
    const { error: eventError } = await admin.from('loja_eventos').upsert({
      event_id: input.eventId, event_name: input.eventName, sessao_id: input.sessaoId, user_id: user?.id || null,
      produto_id: input.produtoId || null, pedido_id: input.pedidoId || null, pagina: input.pagina || null,
      origem: 'browser', propriedades: { ...input.propriedades, meta_consent: input.metaConsent },
    }, { onConflict: 'event_id', ignoreDuplicates: true });
    if (eventError) throw eventError;
    if (input.metaConsent && ['store_visit', 'product_view', 'add_to_cart', 'checkout_started'].includes(input.eventName)) {
      await invokeMetaConversions({ event_id: input.eventId, client_user_agent: request.headers.get('user-agent'), client_ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() });
    }
    return NextResponse.json({ eventId: input.eventId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 });
    console.error('[Analytics] Falha:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Não foi possível registrar o evento.' }, { status: 500 });
  }
}
