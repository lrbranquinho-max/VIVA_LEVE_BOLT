-- Additive foundation. Does not change existing orders, inventory or access policies.
-- Auth tables are not readable by service_role on hosted Supabase. Expose only
-- boolean checks through a private, non-Data-API schema, never account records.
create schema if not exists premium_private;
revoke all on schema premium_private from public,anon,authenticated;
grant usage on schema premium_private to service_role;
create function premium_private.verified_user(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (auth.uid() is null or auth.uid()=p_user_id)
    and exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null);
$$;
create function premium_private.is_admin(p_actor_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (auth.uid() is null or auth.uid()=p_actor_id)
    and exists(select 1 from auth.users u join public.admin_usuario_roles r on lower(r.email)=lower(u.email)
      where u.id=p_actor_id and u.email_confirmed_at is not null and r.role='admin' and r.ativo);
$$;
revoke all on function premium_private.verified_user(uuid),premium_private.is_admin(uuid) from public,anon,authenticated;
grant execute on function premium_private.verified_user(uuid),premium_private.is_admin(uuid) to service_role;

create table public.premium_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  name text not null check (length(trim(name)) between 1 and 120),
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  duration_days integer not null check (duration_days between 1 and 3660),
  resources text[] not null check (cardinality(resources) > 0),
  active boolean not null default true,
  highlighted boolean not null default false,
  display_order integer not null default 0,
  promotional_text text not null default '',
  renewable boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.premium_settings (
  id boolean primary key default true check (id),
  commercial_enabled boolean not null default false,
  enforcement_enabled boolean not null default false,
  purchase_reward_enabled boolean not null default false,
  purchase_minimum_cents integer not null default 15000 check (purchase_minimum_cents > 0),
  purchase_plan_id uuid not null references public.premium_plans(id),
  purchase_duration_days integer not null default 30 check (purchase_duration_days between 1 and 3660),
  expiry_alert_days integer not null default 5 check (expiry_alert_days between 0 and 365),
  accumulation_policy text not null default 'EXTEND' check (accumulation_policy in ('EXTEND','KEEP_ACTIVE')),
  pending_activation_policy text not null default 'AUTOMATIC' check (pending_activation_policy in ('AUTOMATIC','MANUAL')),
  pending_validity_days integer check (pending_validity_days between 1 and 3660),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create index premium_settings_plan_idx on public.premium_settings(purchase_plan_id);

create table public.premium_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  logo_url text,
  description text not null default '',
  responsible_name text not null default '',
  email text,
  phone text,
  partner_type text not null default 'OTHER',
  partnership_type text not null default 'PERMUTA / DIVULGAÇÃO',
  plan_id uuid not null references public.premium_plans(id),
  duration_days integer not null check (duration_days between 1 and 3660),
  active boolean not null default true,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  notes text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at > start_at)
);
create index premium_partners_plan_idx on public.premium_partners(plan_id);

create table public.premium_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  plan_id uuid not null references public.premium_plans(id),
  plan_snapshot jsonb not null,
  duration_days integer not null check (duration_days between 1 and 3660),
  source_type text not null check (source_type in ('SUBSCRIPTION','PURCHASE_REWARD','PARTNER','VIP_GROUP','ADMIN','PROMOTION')),
  source_id text not null check (length(trim(source_id)) between 1 and 200),
  idempotency_key text not null unique check (length(trim(idempotency_key)) between 1 and 250),
  partner_id uuid references public.premium_partners(id),
  start_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','EXPIRED','CANCELLED','REVIEW_REQUIRED')),
  actor_id uuid references auth.users(id),
  reason text not null check (length(trim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (expires_at > start_at),
  check ((source_type in ('PARTNER','VIP_GROUP')) = (partner_id is not null))
);
-- Even a different webhook id cannot reward the same order twice.
create unique index premium_grants_order_once_idx on public.premium_grants(source_id) where source_type = 'PURCHASE_REWARD';
create unique index premium_grants_payment_once_idx on public.premium_grants(source_id) where source_type = 'SUBSCRIPTION';
create index premium_grants_user_idx on public.premium_grants(user_id, created_at desc);
create index premium_grants_plan_idx on public.premium_grants(plan_id);
create index premium_grants_partner_idx on public.premium_grants(partner_id);
create index premium_grants_actor_idx on public.premium_grants(actor_id);

-- Per-resource periods preserve Dieta/Treino balances when plans overlap.
create table public.premium_resource_periods (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.premium_grants(id),
  user_id uuid not null references auth.users(id),
  resource text not null,
  start_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > start_at),
  unique (grant_id, resource)
);
create index premium_resource_periods_access_idx on public.premium_resource_periods(user_id, resource, expires_at);

create table public.premium_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  agent text not null default 'server',
  action text not null,
  entity text not null,
  entity_id text not null,
  before_state jsonb,
  after_state jsonb,
  origin text not null,
  created_at timestamptz not null default now()
);
create index premium_audit_entity_idx on public.premium_audit(entity, entity_id, created_at desc);
create index premium_audit_created_idx on public.premium_audit(created_at desc);

-- No browser writes, including administrators: validated server endpoints only.
do $$
declare table_name text;
begin
  foreach table_name in array array['premium_plans','premium_settings','premium_partners','premium_grants','premium_resource_periods','premium_audit'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update on public.%I to service_role', table_name);
  end loop;
end $$;
revoke update on public.premium_audit from service_role;
grant select on public.premium_grants, public.premium_resource_periods to authenticated;
create policy premium_own_grants on public.premium_grants for select to authenticated using (user_id = (select auth.uid()));
create policy premium_own_periods on public.premium_resource_periods for select to authenticated using (user_id = (select auth.uid()));

insert into public.premium_plans(code,name,price_cents,duration_days,resources,highlighted,display_order,promotional_text) values
('dieta','Plano Dieta',990,30,array['diet.generate','diet.advanced'],false,1,''),
('treino','Plano Treino',990,30,array['training.access'],false,2,''),
('completo','Plano Completo',1590,30,array['diet.generate','diet.advanced','training.access'],true,3,'Melhor custo-benefício');
insert into public.premium_settings(purchase_plan_id) select id from public.premium_plans where code='completo';
insert into public.premium_partners(name,partner_type,plan_id,duration_days)
select 'GRUPO VIP VIVA LEVE','CANAL PRÓPRIO',id,30 from public.premium_plans where code='completo';

create function public.premium_record_change() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  end if;
  insert into public.premium_audit(actor_id,agent,action,entity,entity_id,before_state,after_state,origin)
  values (nullif(current_setting('premium.actor_id',true),'')::uuid,
    coalesce(nullif(current_setting('premium.agent',true),''),'database'),TG_OP,TG_TABLE_NAME,
    NEW.id::text,case when TG_OP='UPDATE' then to_jsonb(OLD) else null end,to_jsonb(NEW),'configuration');
  return NEW;
end $$;
revoke all on function public.premium_record_change() from public, anon, authenticated;
grant execute on function public.premium_record_change() to service_role;
create trigger premium_plans_audit before insert or update on public.premium_plans for each row execute function public.premium_record_change();
create trigger premium_settings_audit before insert or update on public.premium_settings for each row execute function public.premium_record_change();
create trigger premium_partners_audit before insert or update on public.premium_partners for each row execute function public.premium_record_change();
insert into public.premium_audit(agent,action,entity,entity_id,after_state,origin)
select 'migration','INITIAL_CONFIGURATION','premium_plans',id::text,to_jsonb(p),'initial_seed' from public.premium_plans p;
insert into public.premium_audit(agent,action,entity,entity_id,after_state,origin)
select 'migration','INITIAL_CONFIGURATION','premium_settings','true',to_jsonb(s),'initial_seed' from public.premium_settings s;
insert into public.premium_audit(agent,action,entity,entity_id,after_state,origin)
select 'migration','INITIAL_CONFIGURATION','premium_partners',id::text,to_jsonb(p),'initial_seed' from public.premium_partners p;

-- Internal primitive. Only service_role may invoke; never expose its arguments to a client.
create function public.premium_grant_access(
  p_user_id uuid, p_plan_id uuid, p_duration_days integer,
  p_source_type text, p_source_id text, p_idempotency_key text,
  p_actor_id uuid, p_reason text, p_partner_id uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_plan public.premium_plans%rowtype;
  v_existing public.premium_grants%rowtype;
  v_grant_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_resource text;
  v_end timestamptz;
  v_start timestamptz;
  v_max_end timestamptz := now();
  v_policy text;
begin
  if p_user_id is null or p_plan_id is null or p_duration_days is null
    or p_duration_days not between 1 and 3660
    or p_source_type is null or p_source_type not in ('SUBSCRIPTION','PURCHASE_REWARD','PARTNER','VIP_GROUP','ADMIN','PROMOTION')
    or coalesce(length(trim(p_reason)),0) not between 1 and 1000
    or coalesce(length(trim(p_idempotency_key)),0) not between 1 and 250
    or coalesce(length(trim(p_source_id)),0) not between 1 and 200 then
    raise exception 'Invalid grant parameters';
  end if;
  -- Serialize grants per account, not all customers or any store order.
  perform pg_advisory_xact_lock(hashtextextended('premium:' || p_user_id::text,0));
  select * into v_existing from public.premium_grants g where g.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.plan_id <> p_plan_id
      or v_existing.source_type <> p_source_type or v_existing.source_id <> p_source_id
      or v_existing.duration_days <> p_duration_days or v_existing.partner_id is distinct from p_partner_id then
      raise exception 'Idempotency key conflict';
    end if;
    return v_existing.id;
  end if;
  select * into strict v_plan from public.premium_plans where id=p_plan_id;
  if not v_plan.active then raise exception 'Inactive plan'; end if;
  if not premium_private.verified_user(p_user_id) then
    raise exception 'Verified account required';
  end if;
  if p_source_type in ('PARTNER','VIP_GROUP') then
    if not exists(select 1 from public.premium_partners partner where partner.id=p_partner_id
      and partner.active and partner.start_at <= v_now and (partner.end_at is null or partner.end_at > v_now)
      and partner.plan_id=p_plan_id and partner.duration_days=p_duration_days
      and p_source_id=partner.id::text) then raise exception 'Invalid partner benefit'; end if;
  elsif p_partner_id is not null then raise exception 'Unexpected partner';
  end if;
  select accumulation_policy into strict v_policy from public.premium_settings where id;
  insert into public.premium_grants(id,user_id,plan_id,plan_snapshot,duration_days,source_type,source_id,
    idempotency_key,partner_id,start_at,expires_at,actor_id,reason)
  values(v_grant_id,p_user_id,p_plan_id,to_jsonb(v_plan),p_duration_days,p_source_type,p_source_id,
    p_idempotency_key,p_partner_id,v_now,v_now+make_interval(days=>p_duration_days),p_actor_id,p_reason);
  for v_resource in select distinct unnest(v_plan.resources) loop
    select greatest(v_now,coalesce(max(period.expires_at),v_now)) into v_start
    from public.premium_resource_periods period join public.premium_grants g on g.id=period.grant_id
    where period.user_id=p_user_id and period.resource=v_resource and g.status in ('ACTIVE','REVIEW_REQUIRED');
    -- Paid renewals always extend. KEEP_ACTIVE applies only to non-paid benefits.
    if v_policy='KEEP_ACTIVE' and p_source_type <> 'SUBSCRIPTION' and v_start > v_now then
      v_end := v_start;
    else
      v_end := v_start + make_interval(days=>p_duration_days);
      insert into public.premium_resource_periods(grant_id,user_id,resource,start_at,expires_at)
      values(v_grant_id,p_user_id,v_resource,v_start,v_end);
    end if;
    v_max_end := greatest(v_max_end,v_end);
  end loop;
  update public.premium_grants set expires_at=v_max_end where id=v_grant_id;
  insert into public.premium_audit(actor_id,action,entity,entity_id,after_state,origin)
  select p_actor_id,'GRANT','premium_grants',g.id::text,to_jsonb(g),p_source_type from public.premium_grants g where id=v_grant_id;
  return v_grant_id;
end $$;
revoke all on function public.premium_grant_access(uuid,uuid,integer,text,text,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.premium_grant_access(uuid,uuid,integer,text,text,text,uuid,text,uuid) to service_role;

create function public.premium_has_access(p_resource text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.premium_resource_periods period
    join public.premium_grants g on g.id=period.grant_id
    where period.user_id=(select auth.uid()) and period.resource=p_resource
      and period.start_at<=now() and period.expires_at>now() and g.status in ('ACTIVE','REVIEW_REQUIRED'));
$$;
revoke all on function public.premium_has_access(text) from public,anon;
grant execute on function public.premium_has_access(text) to authenticated,service_role;

create function public.premium_admin_save_plan(p_actor_id uuid, p_data jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_resources text[];
begin
  if not premium_private.is_admin(p_actor_id) then
    raise exception 'Administrator required';
  end if;
  perform set_config('premium.actor_id',p_actor_id::text,true);
  perform set_config('premium.agent','admin_api',true);
  select array_agg(distinct value order by value) into v_resources from jsonb_array_elements_text(p_data->'resources');
  if v_resources is null or not v_resources <@ array['diet.generate','diet.advanced','training.access'] then
    raise exception 'Unsupported resources';
  end if;
  if p_data->>'id' is null then
    insert into public.premium_plans(code,name,description,price_cents,duration_days,resources,active,highlighted,display_order,promotional_text,renewable)
    values(p_data->>'code',p_data->>'name',p_data->>'description',(p_data->>'price_cents')::integer,
      (p_data->>'duration_days')::integer,v_resources,(p_data->>'active')::boolean,(p_data->>'highlighted')::boolean,
      (p_data->>'display_order')::integer,p_data->>'promotional_text',(p_data->>'renewable')::boolean) returning id into v_id;
  else
    update public.premium_plans set name=p_data->>'name',description=p_data->>'description',
      price_cents=(p_data->>'price_cents')::integer,duration_days=(p_data->>'duration_days')::integer,resources=v_resources,
      active=(p_data->>'active')::boolean,highlighted=(p_data->>'highlighted')::boolean,
      display_order=(p_data->>'display_order')::integer,promotional_text=p_data->>'promotional_text',renewable=(p_data->>'renewable')::boolean
    where id=(p_data->>'id')::uuid and version=(p_data->>'version')::integer returning id into v_id;
    if v_id is null then raise exception 'Configuration changed; reload before saving'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.premium_admin_save_plan(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.premium_admin_save_plan(uuid,jsonb) to service_role;
