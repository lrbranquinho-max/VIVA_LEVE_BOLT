import { NextRequest, NextResponse } from 'next/server';
import { criarSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SANDBOX_CLIENT_ID = 'dba3a8db-fa54-40e0-8bab-7bfb9b6f2e2e';
const SANDBOX_CLIENT_SECRET = 'D/ilRsfoqHlSUChwAMnlyKdDNd7FMsM7cU/vo02REag=';

function resposta(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}

export async function POST(request: NextRequest) {
  try {
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (!bearer) return resposta({ error: 'Sessão inválida.' }, 401);

    const supabase = criarSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(bearer);
    if (error || !data.user) return resposta({ error: 'Sessão inválida.' }, 401);

    const producao = process.env.CIELO_ENVIRONMENT === 'production';
    const clientId = producao ? process.env.CIELO_3DS_CLIENT_ID?.trim() : SANDBOX_CLIENT_ID;
    const clientSecret = producao ? process.env.CIELO_3DS_CLIENT_SECRET?.trim() : SANDBOX_CLIENT_SECRET;
    const establishmentCode = process.env.CIELO_ESTABLISHMENT_CODE?.trim();
    const merchantName = process.env.CIELO_MERCHANT_NAME?.trim() || 'VIVA LEVE';
    const mcc = process.env.CIELO_MCC?.trim();

    if (!clientId || !clientSecret || !establishmentCode || !mcc) {
      return resposta({ error: 'Credenciais 3DS ou dados do estabelecimento Cielo não configurados.' }, 503);
    }

    const endpoint = producao
      ? 'https://mpi.braspag.com.br/v2/auth/token'
      : 'https://mpisandbox.braspag.com.br/v2/auth/token';
    const http = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        EstablishmentCode: Number(establishmentCode),
        MerchantName: merchantName.slice(0, 25),
        MCC: Number(mcc),
      }),
      cache: 'no-store',
    });
    const token = await http.json().catch(() => ({})) as { access_token?: string; ReturnMessage?: string };
    if (!http.ok || !token.access_token) {
      return resposta({ error: token.ReturnMessage || 'Não foi possível iniciar a autenticação 3DS.' }, 502);
    }

    return resposta({ accessToken: token.access_token, environment: producao ? 'PRD' : 'SDB' });
  } catch (error: any) {
    console.error('[Cielo 3DS] Falha ao criar token', { message: error?.message });
    return resposta({ error: 'Não foi possível iniciar a autenticação 3DS.' }, 500);
  }
}
