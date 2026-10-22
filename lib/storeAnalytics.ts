'use client';

import { supabase } from '@/supabase';

export type StoreEventName =
  | 'store_visit' | 'product_impression' | 'product_click' | 'product_view' | 'add_to_cart' | 'checkout_started'
  | 'payment_started' | 'purchase' | 'whatsapp_click' | 'instagram_click';

export type Attribution = {
  utm_source?: string; utm_medium?: string; utm_campaign?: string;
  utm_content?: string; utm_term?: string; fbclid?: string;
  fbc?: string; fbp?: string; referrer?: string; landing_page?: string;
};

type Session = { id: string; createdAt: number; lastSeenAt: number; firstTouch: Attribution; lastTouch: Attribution };
type EventProperties = {
  value?: number; currency?: 'BRL'; content_ids?: Array<string | number>;
  content_name?: string | string[]; content_type?: 'product'; quantity?: number;
  num_items?: number; original_price?: number; discount_percent?: number; final_price?: number;
  discount_campaign?: string; discount_coupon_id?: string; has_discount?: boolean; [key: string]: unknown;
};

const SESSION_KEY = 'viva-leve-analytics-session-v1';
const FIRST_TOUCH_KEY = 'viva-leve-analytics-first-touch-v1';
const LAST_TOUCH_KEY = 'viva-leve-analytics-last-touch-v1';
const CONSENT_KEY = 'viva-leve-meta-consent-v1';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();

declare global {
  interface Window { fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string }; _fbq?: Window['fbq']; }
}

function safeJson<T>(value: string | null): T | null {
  try { return value ? JSON.parse(value) as T : null; } catch { return null; }
}

function cookie(name: string) {
  return document.cookie.split('; ').find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function attributionFromUrl(url: URL, referrer = '', fbp?: string): Attribution {
  const value = (name: string) => url.searchParams.get(name)?.trim() || undefined;
  const fbclid = value('fbclid');
  return {
    utm_source: value('utm_source'), utm_medium: value('utm_medium'), utm_campaign: value('utm_campaign'),
    utm_content: value('utm_content'), utm_term: value('utm_term'), fbclid,
    fbc: cookieSafe('_fbc') || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined),
    fbp: fbp || cookieSafe('_fbp'), referrer: referrer || undefined,
    landing_page: `${url.pathname}${url.search}`,
  };
}

function cookieSafe(name: string) {
  return typeof document === 'undefined' ? undefined : cookie(name);
}

function hasCampaign(touch: Attribution) {
  return Boolean(touch.utm_source || touch.utm_medium || touch.utm_campaign || touch.fbclid || touch.fbc);
}

export function getStoreSession(): Session {
  const now = Date.now();
  const current = safeJson<Session>(sessionStorage.getItem(SESSION_KEY));
  const captured = attributionFromUrl(new URL(window.location.href), document.referrer);
  const durableFirst = safeJson<Attribution>(localStorage.getItem(FIRST_TOUCH_KEY));
  const durableLast = safeJson<Attribution>(localStorage.getItem(LAST_TOUCH_KEY));
  const firstTouch = durableFirst || captured;
  if (!durableFirst) localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(firstTouch));
  const active = current && now - current.lastSeenAt <= SESSION_TIMEOUT_MS;
  const campaignTouch = hasCampaign(captured) ? captured : (active ? current.lastTouch : durableLast || captured);
  const lastTouch = { ...campaignTouch, fbc: captured.fbc || campaignTouch.fbc, fbp: captured.fbp || campaignTouch.fbp };
  const session: Session = active
    ? { ...current, lastSeenAt: now, lastTouch }
    : { id: crypto.randomUUID(), createdAt: now, lastSeenAt: now, firstTouch, lastTouch };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(lastTouch));
  return session;
}

export function getMetaConsent() { return localStorage.getItem(CONSENT_KEY) === 'accepted'; }
export function hasMetaConsentChoice() { return localStorage.getItem(CONSENT_KEY) !== null; }
export function setMetaConsent(accepted: boolean) {
  localStorage.setItem(CONSENT_KEY, accepted ? 'accepted' : 'rejected');
  window.dispatchEvent(new CustomEvent('viva-leve-meta-consent-changed'));
}

function initPixel() {
  if (!META_PIXEL_ID || !getMetaConsent() || window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args); else fbq.queue?.push(args);
  } as NonNullable<Window['fbq']>;
  fbq.queue = []; fbq.loaded = true; fbq.version = '2.0'; window.fbq = fbq; window._fbq = fbq;
  const script = document.createElement('script'); script.async = true; script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script); fbq('init', META_PIXEL_ID);
}

const META_NAMES: Partial<Record<StoreEventName, string>> = {
  store_visit: 'PageView', product_view: 'ViewContent', add_to_cart: 'AddToCart',
  checkout_started: 'InitiateCheckout', purchase: 'Purchase',
};

export async function registrarEventoLoja(eventName: StoreEventName, propriedades: EventProperties = {}, options: {
  produtoId?: number; pedidoId?: number | string; eventId?: string; dedupeKey?: string; pagina?: string;
} = {}) {
  try {
    const session = getStoreSession();
    const eventId = options.eventId || crypto.randomUUID();
    if (options.dedupeKey) {
      const key = `viva-leve-event-${options.dedupeKey}`;
      if (sessionStorage.getItem(key)) return eventId;
      sessionStorage.setItem(key, eventId);
    }
    const { data: { session: auth } } = await supabase.auth.getSession();
    const metaConsent = getMetaConsent();
    const payload = {
      eventId, eventName, sessaoId: session.id, firstTouch: session.firstTouch, lastTouch: session.lastTouch,
      metaConsent, produtoId: options.produtoId, pedidoId: options.pedidoId ? Number(options.pedidoId) : undefined,
      pagina: options.pagina || `${location.pathname}${location.search}`, propriedades,
    };
    void fetch('/api/analytics/event', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(auth?.access_token ? { Authorization: `Bearer ${auth.access_token}` } : {}) },
      body: JSON.stringify(payload),
    });
    const metaName = META_NAMES[eventName];
    if (metaName && META_PIXEL_ID && metaConsent) {
      initPixel();
      window.fbq?.('track', metaName, propriedades, { eventID: eventId });
    }
    return eventId;
  } catch { return undefined; }
}

export async function vincularPedidoAnalytics(pedidoId: number | string) {
  try {
    const session = getStoreSession();
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth) return;
    await fetch('/api/analytics/pedido', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
      body: JSON.stringify({ pedidoId: Number(pedidoId), sessaoId: session.id }),
    });
  } catch { /* analytics nunca bloqueia checkout */ }
}

export async function registrarPurchaseConfirmado(pedidoId: number | string) {
  try {
    const key = `viva-leve-purchase-browser-${pedidoId}`;
    if (localStorage.getItem(key)) return;
    const { data: { session: auth } } = await supabase.auth.getSession();
    if (!auth) return;
    const response = await fetch(`/api/analytics/pedido?pedidoId=${encodeURIComponent(String(pedidoId))}`, {
      headers: { Authorization: `Bearer ${auth.access_token}` }, cache: 'no-store',
    });
    if (!response.ok) return;
    const data = await response.json();
    if (META_PIXEL_ID && getMetaConsent()) {
      initPixel();
      window.fbq?.('track', 'Purchase', data.propriedades, { eventID: data.eventId });
    }
    localStorage.setItem(key, data.eventId);
  } catch { /* confirmação do pedido não depende da telemetria */ }
}

export function pixelConfigured() { return Boolean(META_PIXEL_ID); }
