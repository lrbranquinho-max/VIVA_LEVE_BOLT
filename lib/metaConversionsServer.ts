import { criarSupabaseAdmin } from '@/lib/supabaseAdmin';

export async function invokeMetaConversions(body: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  const response = await fetch(`${url}/functions/v1/meta-conversions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok && response.status !== 404) console.warn('[Meta CAPI] despacho adiado:', response.status);
}

export async function authenticatedUser(authorization: string | null) {
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await criarSupabaseAdmin().auth.getUser(token);
  return error ? null : data.user;
}
