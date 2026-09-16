export const NUTRITION_AI_MODEL = 'gpt-4.1-mini';
export const NUTRITION_AI_WEEKLY_BUDGET_USD = 1;

export type NutritionAiUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
  providerRequestId: string | null;
};

export type NutritionAiResponse = {
  source: 'ai' | 'fallback';
  model?: string;
  plan?: unknown;
  reason?: string;
  replayed?: boolean;
  usage?: NutritionAiUsage;
};

export class NutritionAiBridgeError extends Error {
  constructor(readonly code: string) { super(code); }
}

export function normalizeNutritionFallbackReason(error: unknown) {
  if (error instanceof NutritionAiBridgeError) return error.code;
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'SUPABASE_AI_TIMEOUT';
  return 'SUPABASE_AI_UNAVAILABLE';
}

export async function requestNutritionAi(input: {
  authorization: string;
  requisicaoId: string;
  system: string;
  prompt: string;
  imageUrl?: string | null;
}): Promise<NutritionAiResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !publishableKey) throw new NutritionAiBridgeError('SUPABASE_AI_NOT_CONFIGURED');

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-nutrition-plan-ai`, {
    method: 'POST',
    headers: {
      Authorization: input.authorization,
      apikey: publishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requisicaoId: input.requisicaoId,
      system: input.system,
      prompt: input.prompt,
      imageUrl: input.imageUrl ?? null,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(55_000),
  });

  const result = await response.json().catch(() => null) as NutritionAiResponse | { error?: string } | null;
  if (!response.ok) {
    throw new NutritionAiBridgeError(result && 'error' in result && result.error ? result.error : `SUPABASE_AI_HTTP_${response.status}`);
  }
  if (!result || !('source' in result) || !['ai', 'fallback'].includes(result.source)) {
    throw new NutritionAiBridgeError('SUPABASE_AI_INVALID_RESPONSE');
  }
  return result as NutritionAiResponse;
}
