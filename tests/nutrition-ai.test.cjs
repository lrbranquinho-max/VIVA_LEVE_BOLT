const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function compile(relative) {
  const file = path.resolve(__dirname, '..', relative);
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = Module._nodeModulePaths(path.dirname(file));
  compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return compiled.exports;
}

const bridge = compile('lib/nutritionAi.ts');
const route = fs.readFileSync(path.resolve(__dirname, '../app/api/gerar-plano-nutri/route.ts'), 'utf8');
const edge = fs.readFileSync(path.resolve(__dirname, '../supabase/functions/generate-nutrition-plan-ai/index.ts'), 'utf8');
const migration = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20260916120000_plano_nutri_ai_budget.sql'), 'utf8');
const ownerRlsMigration = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20260917100000_restringir_rls_planos_nutri_ao_proprietario.sql'), 'utf8');
const clientPage = fs.readFileSync(path.resolve(__dirname, '../app/dieta/page.tsx'), 'utf8');

test('ponte Next usa Edge Function e nunca tenta ler OPENAI_API_KEY', () => {
  assert.match(route, /requestNutritionAi/);
  assert.doesNotMatch(route, /process\.env\.OPENAI_API_KEY/);
  assert.match(bridge.requestNutritionAi.toString(), /generate-nutrition-plan-ai/);
});

test('Edge Function usa o secret existente, modelo economico e no maximo dois retries', () => {
  assert.match(edge, /Deno\.env\.get\('OPENAI_API_KEY'\)/);
  assert.match(edge, /const MODEL = 'gpt-4\.1-mini'/);
  assert.match(edge, /const MAX_RETRIES = 2/);
  assert.match(edge, /type: 'json_schema'/);
  assert.match(edge, /strict: true/);
});

test('falha da IA sempre cai no fallback matematico existente', () => {
  assert.match(route, /catch \(aiError\)/);
  assert.match(route, /gerarFallback\(metaKcal/);
  assert.match(route, /registrarFallbackInterno/);
  assert.equal(bridge.normalizeNutritionFallbackReason(new bridge.NutritionAiBridgeError('WEEKLY_AI_BUDGET_REACHED')), 'WEEKLY_AI_BUDGET_REACHED');
});

test('orcamento semanal e idempotencia sao exclusivos do Plano Nutri', () => {
  assert.match(migration, /plano_nutri_ai_usage/);
  assert.match(migration, /WEEKLY_AI_BUDGET_REACHED/);
  assert.match(migration, /America\/Sao_Paulo/);
  assert.match(migration, /idempotency_key text not null unique/);
  assert.match(migration, /v_committed \+ p_reserved_cost_usd > 1/);
  assert.doesNotMatch(migration, /update\s+public\.marketing_ai_usage/i);
});

test('ledger registra tokens, custo, resultado, origem, fallback e request id', () => {
  for (const field of [
    'input_tokens', 'output_tokens', 'estimated_cost_usd', 'generation_source',
    'fallback_reason', 'provider_request_id', 'called_at', 'result',
  ]) assert.match(migration, new RegExp(field));
});

test('usuario comum gera e salva o proprio plano no modo automatico', () => {
  assert.match(clientPage, /modoAutomatico && requisicaoCriada\?\.id/);
  assert.match(clientPage, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(clientPage, /salvarAutomaticamente: true/);
  assert.match(route, /!isAdmin && \(!modoAutomatico \|\| requisicao\.user_id !== userId\)/);
  assert.match(route, /salvarAutomaticamente \|\| \(!isAdmin && modoAutomatico\)/);
  assert.match(edge, /requisicao\.user_id === authData\.user\.id/);
});

test('RLS do Plano Nutri limita usuario comum aos proprios registros', () => {
  assert.match(ownerRlsMigration, /drop policy if exists "Acesso autenticado requisicoes"/);
  assert.match(ownerRlsMigration, /drop policy if exists "Acesso autenticado planos gerados"/);
  assert.match(ownerRlsMigration, /with check \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(ownerRlsMigration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
});
