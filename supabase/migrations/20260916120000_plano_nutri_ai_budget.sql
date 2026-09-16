-- Orçamento e auditoria exclusivos da IA do Plano Nutri.
-- Não reutiliza nem altera o ledger/orçamento do Marketing Manager.

create table if not exists public.plano_nutri_ai_usage (
  id uuid primary key default gen_random_uuid(),
  requisicao_id uuid not null references public.planos_requisicoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null unique,
  week_start date not null,
  model text not null,
  status text not null check (status in ('RESERVED', 'AI_SUCCESS', 'FALLBACK')),
  generation_source text not null check (generation_source in ('AI', 'FALLBACK')),
  result text not null,
  fallback_reason text,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reserved_cost_usd numeric(12, 8) not null default 0 check (reserved_cost_usd >= 0),
  estimated_cost_usd numeric(12, 8) not null default 0 check (estimated_cost_usd >= 0),
  provider_request_id text,
  response_snapshot jsonb,
  called_at timestamptz not null default now(),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plano_nutri_ai_usage_week_idx
  on public.plano_nutri_ai_usage (week_start, status, generation_source);
create index if not exists plano_nutri_ai_usage_user_idx
  on public.plano_nutri_ai_usage (user_id, created_at desc);
create index if not exists plano_nutri_ai_usage_requisicao_idx
  on public.plano_nutri_ai_usage (requisicao_id);
create unique index if not exists planos_gerados_requisicao_unique
  on public.planos_gerados (requisicao_id);

alter table public.plano_nutri_ai_usage enable row level security;
revoke all on public.plano_nutri_ai_usage from anon, authenticated;

create or replace function public.plano_nutri_ai_claim(
  p_requisicao_id uuid,
  p_user_id uuid,
  p_idempotency_key text,
  p_model text,
  p_reserved_cost_usd numeric default 0.03
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week_start date := (
    timezone('America/Sao_Paulo', now())::date
    - (extract(isodow from timezone('America/Sao_Paulo', now()))::integer - 1)
  );
  v_existing public.plano_nutri_ai_usage%rowtype;
  v_committed numeric := 0;
  v_id uuid;
begin
  if p_requisicao_id is null or p_user_id is null or coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'INVALID_AI_CLAIM';
  end if;
  if p_reserved_cost_usd <= 0 or p_reserved_cost_usd > 1 then
    raise exception 'INVALID_AI_RESERVATION';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('plano_nutri_ai:' || v_week_start::text, 0));

  update public.plano_nutri_ai_usage
  set status = 'FALLBACK', generation_source = 'FALLBACK', result = 'STALE_RESERVATION_RELEASED',
      fallback_reason = 'OPENAI_TIMEOUT', reserved_cost_usd = 0, finalized_at = now(), updated_at = now()
  where idempotency_key = p_idempotency_key
    and status = 'RESERVED'
    and created_at < now() - interval '5 minutes';

  select * into v_existing
  from public.plano_nutri_ai_usage
  where idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'allowed', false,
      'replayed', true,
      'log_id', v_existing.id,
      'status', v_existing.status,
      'source', v_existing.generation_source,
      'reason', coalesce(v_existing.fallback_reason,
        case when v_existing.status = 'RESERVED' then 'AI_GENERATION_IN_PROGRESS' end),
      'response', v_existing.response_snapshot,
      'input_tokens', v_existing.input_tokens,
      'cached_input_tokens', v_existing.cached_input_tokens,
      'output_tokens', v_existing.output_tokens,
      'cost_usd', v_existing.estimated_cost_usd,
      'provider_request_id', v_existing.provider_request_id,
      'week_start', v_existing.week_start
    );
  end if;

  select coalesce(sum(
    case when status = 'RESERVED' then reserved_cost_usd else estimated_cost_usd end
  ), 0)
  into v_committed
  from public.plano_nutri_ai_usage
  where week_start = v_week_start
    and status in ('RESERVED', 'AI_SUCCESS', 'FALLBACK');

  if v_committed >= 1 or v_committed + p_reserved_cost_usd > 1 then
    insert into public.plano_nutri_ai_usage (
      requisicao_id, user_id, idempotency_key, week_start, model,
      status, generation_source, result, fallback_reason
    ) values (
      p_requisicao_id, p_user_id, p_idempotency_key, v_week_start, p_model,
      'FALLBACK', 'FALLBACK', 'BUDGET_REJECTED', 'WEEKLY_AI_BUDGET_REACHED'
    ) returning id into v_id;

    return jsonb_build_object(
      'allowed', false,
      'replayed', false,
      'log_id', v_id,
      'status', 'FALLBACK',
      'source', 'FALLBACK',
      'reason', 'WEEKLY_AI_BUDGET_REACHED',
      'week_start', v_week_start,
      'week_committed_usd', v_committed
    );
  end if;

  insert into public.plano_nutri_ai_usage (
    requisicao_id, user_id, idempotency_key, week_start, model,
    status, generation_source, result, reserved_cost_usd
  ) values (
    p_requisicao_id, p_user_id, p_idempotency_key, v_week_start, p_model,
    'RESERVED', 'AI', 'IN_PROGRESS', p_reserved_cost_usd
  ) returning id into v_id;

  return jsonb_build_object(
    'allowed', true,
    'replayed', false,
    'log_id', v_id,
    'status', 'RESERVED',
    'source', 'AI',
    'week_start', v_week_start,
    'week_committed_usd', v_committed,
    'reserved_cost_usd', p_reserved_cost_usd
  );
end;
$$;

create or replace function public.plano_nutri_ai_finalize(
  p_log_id uuid,
  p_status text,
  p_result text,
  p_fallback_reason text,
  p_input_tokens bigint,
  p_cached_input_tokens bigint,
  p_output_tokens bigint,
  p_estimated_cost_usd numeric,
  p_provider_request_id text,
  p_response_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.plano_nutri_ai_usage%rowtype;
begin
  if p_status not in ('AI_SUCCESS', 'FALLBACK') then
    raise exception 'INVALID_AI_FINAL_STATUS';
  end if;

  update public.plano_nutri_ai_usage
  set status = p_status,
      generation_source = case when p_status = 'AI_SUCCESS' then 'AI' else 'FALLBACK' end,
      result = coalesce(nullif(trim(p_result), ''), p_status),
      fallback_reason = p_fallback_reason,
      input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
      cached_input_tokens = greatest(coalesce(p_cached_input_tokens, 0), 0),
      output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
      estimated_cost_usd = greatest(coalesce(p_estimated_cost_usd, 0), 0),
      provider_request_id = p_provider_request_id,
      response_snapshot = p_response_snapshot,
      reserved_cost_usd = 0,
      finalized_at = now(),
      updated_at = now()
  where id = p_log_id
  returning * into v_row;

  if not found then raise exception 'AI_USAGE_NOT_FOUND'; end if;
  return jsonb_build_object('ok', true, 'log_id', v_row.id, 'status', v_row.status);
end;
$$;

create or replace function public.registrar_fallback_plano_nutri_ai(
  p_requisicao_id uuid,
  p_reason text,
  p_result text default 'FALLBACK_GENERATED'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_week_start date := (
    timezone('America/Sao_Paulo', now())::date
    - (extract(isodow from timezone('America/Sao_Paulo', now()))::integer - 1)
  );
  v_key text := 'nutrition-plan:' || p_requisicao_id::text || ':v1';
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select user_id into v_owner from public.planos_requisicoes where id = p_requisicao_id;
  if v_owner is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_owner <> v_uid and not public.is_viva_leve_admin() then raise exception 'FORBIDDEN'; end if;

  insert into public.plano_nutri_ai_usage (
    requisicao_id, user_id, idempotency_key, week_start, model,
    status, generation_source, result, fallback_reason, finalized_at
  ) values (
    p_requisicao_id, v_owner, v_key, v_week_start, 'gpt-4.1-mini',
    'FALLBACK', 'FALLBACK', coalesce(nullif(trim(p_result), ''), 'FALLBACK_GENERATED'),
    coalesce(nullif(trim(p_reason), ''), 'UNKNOWN_AI_FAILURE'), now()
  )
  on conflict (idempotency_key) do update
  set status = 'FALLBACK',
      generation_source = 'FALLBACK',
      result = excluded.result,
      fallback_reason = excluded.fallback_reason,
      finalized_at = coalesce(public.plano_nutri_ai_usage.finalized_at, now()),
      updated_at = now();
end;
$$;

create or replace function public.resumo_plano_nutri_ai_semana()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week_start date := (
    timezone('America/Sao_Paulo', now())::date
    - (extract(isodow from timezone('America/Sao_Paulo', now()))::integer - 1)
  );
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_viva_leve_admin() then raise exception 'FORBIDDEN'; end if;
  select jsonb_build_object(
    'week_start', v_week_start,
    'budget_usd', 1.00,
    'spent_usd', coalesce(sum(estimated_cost_usd), 0),
    'reserved_usd', coalesce(sum(reserved_cost_usd) filter (where status = 'RESERVED'), 0),
    'ai_count', count(*) filter (where generation_source = 'AI' and status = 'AI_SUCCESS'),
    'fallback_count', count(*) filter (where generation_source = 'FALLBACK'),
    'average_ai_cost_usd', coalesce(avg(estimated_cost_usd) filter (where status = 'AI_SUCCESS'), 0)
  ) into v_result
  from public.plano_nutri_ai_usage
  where week_start = v_week_start;
  return v_result;
end;
$$;

revoke all on function public.plano_nutri_ai_claim(uuid, uuid, text, text, numeric) from public, anon, authenticated;
revoke all on function public.plano_nutri_ai_finalize(uuid, text, text, text, bigint, bigint, bigint, numeric, text, jsonb) from public, anon, authenticated;
grant execute on function public.plano_nutri_ai_claim(uuid, uuid, text, text, numeric) to service_role;
grant execute on function public.plano_nutri_ai_finalize(uuid, text, text, text, bigint, bigint, bigint, numeric, text, jsonb) to service_role;

revoke all on function public.registrar_fallback_plano_nutri_ai(uuid, text, text) from public, anon;
grant execute on function public.registrar_fallback_plano_nutri_ai(uuid, text, text) to authenticated;
revoke all on function public.resumo_plano_nutri_ai_semana() from public, anon;
grant execute on function public.resumo_plano_nutri_ai_semana() to authenticated;

comment on table public.plano_nutri_ai_usage is
  'Ledger exclusivo do Plano Nutri. Não compartilha orçamento com marketing_ai_usage.';
