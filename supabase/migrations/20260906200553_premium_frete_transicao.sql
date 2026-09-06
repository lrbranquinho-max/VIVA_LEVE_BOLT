-- Commercial decisions confirmed on 2026-09-06. Configuration only: no grants,
-- customer updates, payment hooks or activation of premium enforcement.
alter table public.premium_settings
  add column purchase_include_shipping boolean not null default false,
  add column transition_enabled boolean not null default false,
  add column transition_duration_days integer not null default 30
    check (transition_duration_days between 1 and 3660),
  add column transition_plan_id uuid references public.premium_plans(id),
  add column transition_starts_at timestamptz,
  add constraint premium_transition_plan_required
    check (not transition_enabled or transition_plan_id is not null);
create index premium_settings_transition_plan_idx on public.premium_settings(transition_plan_id);

-- The existing audit trigger records this configuration decision. No invented
-- administrator UUID: the agent and decision date identify the migration origin.
select set_config('premium.agent','migration:user_decision_2026_09_06',true);
update public.premium_settings
set purchase_include_shipping=true,
    transition_enabled=true,
    transition_duration_days=30,
    transition_plan_id=(select id from public.premium_plans where code='completo')
where id;

comment on column public.premium_settings.purchase_include_shipping is
  'Include actually paid shipping in net paid amount; never add shipping twice to provider total.';
comment on column public.premium_settings.transition_starts_at is
  'Set once at commercial rollout, not during configuration. No transition days consumed while null.';
