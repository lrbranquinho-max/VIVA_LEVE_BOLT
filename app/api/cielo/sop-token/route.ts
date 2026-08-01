import { NextRequest, NextResponse } from 'next/server';
import { criarSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOP_URLS = {
  sandbox: {
    auth: 'https://authsandbox.braspag.com.br/oauth2/token',
    accessToken: 'https://transactionsandbox.pagador.com.br/post/api/public/v2/accesstoken',
  },
  production: {
    auth: 'https://auth.braspag.com.br/oauth2/token',
    accessToken: 'https://transaction.pagador.com.br/post/api/public/v2/accesstoken',
  },
};

function noStore(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' },
  });
}

export async function GET() {
  const enabled = Boolean(
    process.env.CIELO_MERCHANT_ID?.trim() &&
    process.env.CIELO_MERCHANT_KEY?.trim() &&
    process.env.CIELO_SOP_CLIENT_ID?.trim() &&
    process.env.CIELO_SOP_CLIENT_SECRET?.trim()
  );
  return noStore({ enabled });
}

export async function POST(request: NextRequest) {
  try {
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (!bearer) return noStore({ error: 'Sessão inválida.' }, 401);

    const supabase = criarSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(bearer);
    if (error || !data.user) return noStore({ error: 'Sessão inválida.' }, 401);

    const merchantId = process.env.CIELO_MERCHANT_ID?.trim();
    const clientId = process.env.CIELO_SOP_CLIENT_ID?.trim();
    const clientSecret = process.env.CIELO_SOP_CLIENT_SECRET?.trim();
    if (!merchantId || !clientId || !clientSecret) {
      return noStore({ error: 'Silent Order Post da Cielo não configurado.' }, 503);
    }

    const ambiente = process.env.CIELO_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
    const urls = SOP_URLS[ambiente];
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const oauthHttp = await fetch(urls.auth, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
    });
    const oauth = await oauthHttp.json().catch(() => ({})) as { access_token?: string };
    if (!oauthHttp.ok || !oauth.access_token) {
      return noStore({ error: 'Não foi possível iniciar a proteção dos dados do cartão.' }, 502);
    }

    const sopHttp = await fetch(urls.accessToken, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${oauth.access_token}`,
        MerchantId: merchantId,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    const sop = await sopHttp.json().catch(() => ({})) as { AccessToken?: string; ExpiresIn?: string };
    if (!sopHttp.ok || !sop.AccessToken) {
      return noStore({ error: 'Não foi possível proteger os dados do cartão.' }, 502);
    }

    return noStore({ accessToken: sop.AccessToken, expiresIn: sop.ExpiresIn, environment: ambiente });
  } catch (error: any) {
    console.error('[Cielo SOP] Falha ao gerar token', { message: error?.message });
    return noStore({ error: 'Não foi possível iniciar o pagamento protegido.' }, 500);
  }
}
