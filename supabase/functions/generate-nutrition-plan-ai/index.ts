import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

const MODEL = 'gpt-4.1-mini';
const INPUT_PRICE_PER_MILLION = 0.40;
const CACHED_INPUT_PRICE_PER_MILLION = 0.10;
const OUTPUT_PRICE_PER_MILLION = 1.60;
const RESERVED_COST_USD = 0.04;
const MAX_RETRIES = 2;
const MAX_OUTPUT_TOKENS = 12_000;
const FUNCTION_VERSION = 'nutrition-plan-v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const planoSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['objetivo_estabelecido', 'kcal_diaria_meta', 'metas_macros_diarias', 'dias'],
  properties: {
    objetivo_estabelecido: { type: 'string' },
    kcal_diaria_meta: { type: 'number' },
    metas_macros_diarias: {
      type: 'object',
      additionalProperties: false,
      required: ['kcal', 'proteinas', 'gorduras', 'carboidratos'],
      properties: {
        kcal: { type: 'number' },
        proteinas: { type: 'number' },
        gorduras: { type: 'number' },
        carboidratos: { type: 'number' },
      },
    },
    dias: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dia', 'meta_kcal', 'kcal_planejadas', 'calorias_livres', 'nota_salada', 'nota_rodape', 'refeicoes'],
        properties: {
          dia: { type: 'string', enum: ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo'] },
          meta_kcal: { type: 'number' },
          kcal_planejadas: { type: 'number' },
          calorias_livres: { type: 'number' },
          nota_salada: { type: 'string' },
          nota_rodape: { type: 'string' },
          refeicoes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['nome_refeicao', 'titulo_resumo', 'descricao_completa', 'modo_preparo', 'kcal_total', 'carb_total', 'prot_total', 'gord_total', 'produtos_loja_ids'],
              properties: {
                nome_refeicao: { type: 'string', enum: ['Cafe da Manha', 'Lanche da Manha', 'Almoco', 'Lanche da Tarde', 'Jantar', 'Ceia'] },
                titulo_resumo: { type: 'string' },
                descricao_completa: { type: 'string' },
                modo_preparo: { type: 'string' },
                kcal_total: { type: 'number' },
                carb_total: { type: 'number' },
                prot_total: { type: 'number' },
                gord_total: { type: 'number' },
                produtos_loja_ids: { type: 'array', items: { type: 'integer' } },
              },
            },
          },
        },
      },
    },
  },
};

type Payload = {
  requisicaoId?: string;
  system?: string;
  prompt?: string;
  imageUrl?: string | null;
};

function extractText(response: any) {
  for (const item of response?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function cost(inputTokens: number, cachedInputTokens: number, outputTokens: number) {
  const uncached = Math.max(inputTokens - cachedInputTokens, 0);
  return (
    uncached * INPUT_PRICE_PER_MILLION
    + cachedInputTokens * CACHED_INPUT_PRICE_PER_MILLION
    + outputTokens * OUTPUT_PRICE_PER_MILLION
  ) / 1_000_000;
}

function fallbackReason(error: unknown) {
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'OPENAI_TIMEOUT';
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('OPENAI_HTTP_429')) return 'OPENAI_RATE_LIMITED';
  if (message.includes('OPENAI_HTTP_')) return 'OPENAI_PROVIDER_ERROR';
  if (message.includes('INVALID_RESPONSE')) return 'OPENAI_INVALID_RESPONSE';
  if (message.includes('OPENAI_API_KEY_MISSING')) return 'OPENAI_API_KEY_MISSING';
  return 'OPENAI_UNAVAILABLE';
}

async function wait(milliseconds: number) {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const openAIKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  let logId = '';

  try {
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: 'AUTH_REQUIRED' }, 401);

    const body = await request.json() as Payload;
    const requisicaoId = String(body.requisicaoId ?? '');
    const system = String(body.system ?? '');
    const prompt = String(body.prompt ?? '');
    const imageUrl = body.imageUrl ? String(body.imageUrl) : null;
    if (!/^[0-9a-f-]{36}$/i.test(requisicaoId) || !system || !prompt) return json({ error: 'INVALID_PAYLOAD' }, 400);
    if (system.length > 30_000 || prompt.length > 500_000) return json({ error: 'PAYLOAD_TOO_LARGE' }, 413);
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) return json({ error: 'INVALID_IMAGE_URL' }, 400);

    const { data: requisicao, error: requisicaoError } = await admin.from('planos_requisicoes')
      .select('id,user_id').eq('id', requisicaoId).maybeSingle();
    if (requisicaoError) throw requisicaoError;
    if (!requisicao) return json({ error: 'REQUEST_NOT_FOUND' }, 404);

    let authorized = requisicao.user_id === authData.user.id;
    if (!authorized && authData.user.email) {
      const { data: role } = await admin.from('admin_usuario_roles')
        .select('email').eq('email', authData.user.email.toLowerCase()).eq('role', 'admin').eq('ativo', true).maybeSingle();
      authorized = Boolean(role);
    }
    if (!authorized) return json({ error: 'FORBIDDEN' }, 403);

    const idempotencyKey = `nutrition-plan:${requisicaoId}:v1`;
    const { data: claim, error: claimError } = await admin.rpc('plano_nutri_ai_claim', {
      p_requisicao_id: requisicaoId,
      p_user_id: requisicao.user_id,
      p_idempotency_key: idempotencyKey,
      p_model: MODEL,
      p_reserved_cost_usd: RESERVED_COST_USD,
    });
    if (claimError) throw claimError;
    logId = String(claim?.log_id ?? '');

    if (claim?.replayed && claim?.status === 'AI_SUCCESS' && claim?.response) {
      return json({
        source: 'ai', model: MODEL, plan: claim.response, replayed: true,
        usage: {
          inputTokens: Number(claim.input_tokens ?? 0),
          cachedInputTokens: Number(claim.cached_input_tokens ?? 0),
          outputTokens: Number(claim.output_tokens ?? 0),
          costUsd: Number(claim.cost_usd ?? 0),
          providerRequestId: claim.provider_request_id ?? null,
        },
      });
    }
    if (!claim?.allowed) {
      return json({ source: 'fallback', reason: claim?.reason ?? 'AI_GENERATION_IN_PROGRESS', replayed: Boolean(claim?.replayed) });
    }
    if (!openAIKey) throw new Error('OPENAI_API_KEY_MISSING');

    const userContent: any[] = [{ type: 'input_text', text: prompt }];
    if (imageUrl) userContent.push({ type: 'input_image', image_url: imageUrl, detail: 'high' });
    const openAIBody = {
      model: MODEL,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: userContent },
      ],
      text: { format: { type: 'json_schema', name: 'plano_nutri', strict: true, schema: planoSchema } },
      temperature: 0.15,
      max_output_tokens: MAX_OUTPUT_TOKENS,
    };

    let responseData: any = null;
    let providerRequestId: string | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAIKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'X-Client-Request-Id': requisicaoId,
          },
          body: JSON.stringify(openAIBody),
          signal: AbortSignal.timeout(30_000),
        });
        providerRequestId = response.headers.get('x-request-id');
        const parsed = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
        responseData = parsed;
        break;
      } catch (error) {
        lastError = error;
        if (attempt === MAX_RETRIES) throw error;
        await wait(300 * (2 ** attempt));
      }
    }
    if (!responseData) throw lastError ?? new Error('OPENAI_INVALID_RESPONSE');

    const outputText = extractText(responseData);
    if (!outputText) throw new Error('OPENAI_INVALID_RESPONSE');
    let plan: any;
    try { plan = JSON.parse(outputText); } catch { throw new Error('OPENAI_INVALID_RESPONSE'); }
    if (!Array.isArray(plan?.dias) || plan.dias.length !== 7) throw new Error('OPENAI_INVALID_RESPONSE');

    const inputTokens = Number(responseData?.usage?.input_tokens ?? 0);
    const cachedInputTokens = Number(responseData?.usage?.input_tokens_details?.cached_tokens ?? 0);
    const outputTokens = Number(responseData?.usage?.output_tokens ?? 0);
    const estimatedCostUsd = cost(inputTokens, cachedInputTokens, outputTokens);
    providerRequestId = providerRequestId || responseData?.id || null;

    const { error: finalizeError } = await admin.rpc('plano_nutri_ai_finalize', {
      p_log_id: logId,
      p_status: 'AI_SUCCESS',
      p_result: 'STRUCTURED_PLAN_GENERATED',
      p_fallback_reason: null,
      p_input_tokens: inputTokens,
      p_cached_input_tokens: cachedInputTokens,
      p_output_tokens: outputTokens,
      p_estimated_cost_usd: estimatedCostUsd,
      p_provider_request_id: providerRequestId,
      p_response_snapshot: plan,
    });
    if (finalizeError) throw finalizeError;

    return json({
      source: 'ai', model: MODEL, plan,
      usage: { inputTokens, cachedInputTokens, outputTokens, costUsd: estimatedCostUsd, providerRequestId },
    });
  } catch (error) {
    const reason = fallbackReason(error);
    if (logId) {
      try {
        await admin.rpc('plano_nutri_ai_finalize', {
          p_log_id: logId,
          p_status: 'FALLBACK',
          p_result: 'AI_CALL_FAILED',
          p_fallback_reason: reason,
          p_input_tokens: 0,
          p_cached_input_tokens: 0,
          p_output_tokens: 0,
          p_estimated_cost_usd: 0,
          p_provider_request_id: null,
          p_response_snapshot: null,
        });
      } catch { /* O fallback ao usuario nao depende da telemetria. */ }
    }
    console.error('Nutrition AI fallback:', reason);
    return json({ source: 'fallback', reason });
  }
});
