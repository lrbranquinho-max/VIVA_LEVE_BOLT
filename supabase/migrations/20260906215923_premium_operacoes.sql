create table public.premium_import_batches (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.premium_partners(id),
  reference text not null, created_by uuid not null references auth.users(id), plan_id uuid not null references public.premium_plans(id),
  duration_days integer not null check(duration_days between 1 and 3660), start_policy text not null default 'CONFIRMATION',
  total_rows integer not null default 0, valid_rows integer not null default 0, invalid_rows integer not null default 0,
  duplicated_rows integer not null default 0, activated_rows integer not null default 0, pending_rows integer not null default 0,
  status text not null default 'PREVIEW' check(status in ('PREVIEW','CONFIRMED','PARTIAL','FAILED')),
  created_at timestamptz not null default now(), confirmed_at timestamptz, unique(partner_id,reference)
);
create index premium_import_batches_partner_idx on public.premium_import_batches(partner_id,created_at desc);
create index premium_import_batches_plan_idx on public.premium_import_batches(plan_id);
create index premium_import_batches_creator_idx on public.premium_import_batches(created_by);

create table public.premium_import_rows (
  id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.premium_import_batches(id),
  row_number integer not null, name text not null default '', email text not null default '', normalized_email text not null default '',
  status text not null check(status in ('INVALID','DUPLICATE','EXISTING_USER','PENDING_USER','ALREADY_ACTIVE','ACTIVATED','PENDING_REGISTRATION','ERROR')),
  error_message text, user_id uuid references auth.users(id), grant_id uuid references public.premium_grants(id),
  created_at timestamptz not null default now(), unique(batch_id,row_number)
);
create index premium_import_rows_batch_idx on public.premium_import_rows(batch_id,status);
create index premium_import_rows_email_idx on public.premium_import_rows(normalized_email);

create table public.premium_pending_benefits (
  id uuid primary key default gen_random_uuid(), email text not null, normalized_email text not null,
  name text not null default '', partner_id uuid not null references public.premium_partners(id), plan_id uuid not null references public.premium_plans(id),
  duration_days integer not null check(duration_days between 1 and 3660), import_batch_id uuid not null references public.premium_import_batches(id),
  import_row_id uuid not null unique references public.premium_import_rows(id), status text not null default 'PENDING_REGISTRATION'
    check(status in ('PENDING_REGISTRATION','ACTIVATED','EXPIRED','CANCELLED','ERROR')),
  expiration_policy text not null default 'ON_REGISTRATION', expires_at timestamptz,
  user_id uuid references auth.users(id), grant_id uuid references public.premium_grants(id), created_at timestamptz not null default now(), activated_at timestamptz
);
create index premium_pending_email_idx on public.premium_pending_benefits(normalized_email,status);
create index premium_pending_partner_idx on public.premium_pending_benefits(partner_id);
create index premium_pending_plan_idx on public.premium_pending_benefits(plan_id);
create index premium_pending_batch_idx on public.premium_pending_benefits(import_batch_id);

create table public.premium_email_templates (
  code text primary key, subject_template text not null, html_template text not null, active boolean not null default true,
  version integer not null default 1, updated_at timestamptz not null default now()
);
create table public.premium_email_outbox (
  id uuid primary key default gen_random_uuid(), template_code text not null references public.premium_email_templates(code),
  recipient_email text not null, partner_id uuid references public.premium_partners(id), pending_benefit_id uuid references public.premium_pending_benefits(id),
  variables jsonb not null default '{}', status text not null default 'PENDING' check(status in ('PENDING','SENDING','SENT','FAILED')),
  attempts integer not null default 0, provider_message_id text, last_error text, created_at timestamptz not null default now(), sent_at timestamptz,
  unique(template_code,pending_benefit_id)
);
create index premium_email_outbox_status_idx on public.premium_email_outbox(status,created_at);
create index premium_email_outbox_partner_idx on public.premium_email_outbox(partner_id);

create table public.premium_checkouts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), plan_id uuid not null references public.premium_plans(id),
  plan_snapshot jsonb not null, amount_cents integer not null check(amount_cents>=0), duration_days integer not null check(duration_days between 1 and 3660),
  gateway text not null, gateway_preference_id text unique, gateway_payment_id text unique,
  status text not null default 'CREATED' check(status in ('CREATED','PENDING','PROCESSING','APPROVED','DECLINED','CANCELLED','REFUNDED','CHARGEBACK','ERROR')),
  idempotency_key uuid not null unique, status_detail text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), paid_at timestamptz
);
create index premium_checkouts_user_idx on public.premium_checkouts(user_id,created_at desc);
create index premium_checkouts_plan_idx on public.premium_checkouts(plan_id);
create table public.premium_payment_events (
  id uuid primary key default gen_random_uuid(), checkout_id uuid not null references public.premium_checkouts(id), gateway text not null,
  gateway_event_id text not null, status text not null, amount_cents integer, payload_digest text,
  received_at timestamptz not null default now(), processed_at timestamptz, error text, unique(gateway,gateway_event_id,status)
);
create index premium_payment_events_checkout_idx on public.premium_payment_events(checkout_id,received_at desc);

create table public.premium_usage_events (
  id bigint generated always as identity primary key,user_id uuid references auth.users(id),event_type text not null,
  resource text,metadata jsonb not null default '{}',created_at timestamptz not null default now()
);
create index premium_usage_type_idx on public.premium_usage_events(event_type,created_at desc);
create index premium_usage_user_idx on public.premium_usage_events(user_id,created_at desc);

do $$ declare n text; begin foreach n in array array['premium_import_batches','premium_import_rows','premium_pending_benefits','premium_email_templates','premium_email_outbox','premium_checkouts','premium_payment_events','premium_usage_events'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated',n);
  execute format('grant select,insert,update on public.%I to service_role',n);
end loop; end $$;
grant select on public.premium_checkouts to authenticated;
create policy premium_own_checkouts on public.premium_checkouts for select to authenticated using(user_id=(select auth.uid()));

insert into public.premium_email_templates(code,subject_template,html_template) values
('PARTNER_INVITE','Você ganhou um benefício Viva Leve através de {{partner_name}}',
'<h1>Olá, {{name}}.</h1><p>{{partner_name}}, parceira da Viva Leve, concedeu a você {{duration_days}} dias de acesso ao {{plan_name}}.</p><p>Crie ou acesse sua conta com este email para ativar seu benefício.</p><p><a href="{{activation_url}}">ATIVAR MEU BENEFÍCIO</a></p>');

create function premium_private.user_by_email(p_email text) returns uuid language sql stable security definer set search_path='' as $$
  select id from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null order by created_at limit 1;
$$;
revoke all on function premium_private.user_by_email(text) from public,anon,authenticated;
grant execute on function premium_private.user_by_email(text) to service_role;

create function public.premium_activate_pending(p_user_id uuid,p_email text) returns integer
language plpgsql security invoker set search_path='' as $$
declare r record; n integer:=0; gid uuid;
begin
  if not premium_private.verified_user(p_user_id) or premium_private.user_by_email(p_email) is distinct from p_user_id then raise exception 'Verified email mismatch'; end if;
  perform pg_advisory_xact_lock(hashtextextended('premium-pending:'||lower(trim(p_email)),0));
  for r in select pb.* from public.premium_pending_benefits pb where pb.normalized_email=lower(trim(p_email)) and pb.status='PENDING_REGISTRATION'
    and (pb.expires_at is null or pb.expires_at>now()) order by pb.created_at for update loop
    gid:=public.premium_grant_access(p_user_id,r.plan_id,r.duration_days,
      case when (select partner_type from public.premium_partners where id=r.partner_id)='CANAL PRÓPRIO' then 'VIP_GROUP' else 'PARTNER' end,
      r.partner_id::text,'pending:'||r.id::text,null,'Ativação automática de benefício pendente',r.partner_id);
    update public.premium_pending_benefits set status='ACTIVATED',user_id=p_user_id,grant_id=gid,activated_at=now() where id=r.id;
    update public.premium_import_rows set status='ACTIVATED',user_id=p_user_id,grant_id=gid where id=r.import_row_id;
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.premium_activate_pending(uuid,text) from public,anon,authenticated;
grant execute on function public.premium_activate_pending(uuid,text) to service_role;

create function public.premium_record_payment(p_checkout_id uuid,p_payment_id text,p_status text,p_amount_cents integer,p_detail text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare c public.premium_checkouts%rowtype; gid uuid; normalized text;
begin
  select * into strict c from public.premium_checkouts where id=p_checkout_id for update;
  normalized:=case when lower(p_status) in ('approved','paid','confirmed') then 'APPROVED'
    when lower(p_status) in ('pending') then 'PENDING' when lower(p_status) in ('in_process','processing') then 'PROCESSING'
    when lower(p_status) in ('rejected','declined','failed') then 'DECLINED' when lower(p_status)='cancelled' then 'CANCELLED'
    when lower(p_status)='refunded' then 'REFUNDED' when lower(p_status)='charged_back' then 'CHARGEBACK' else 'ERROR' end;
  if normalized='APPROVED' and p_amount_cents is distinct from c.amount_cents then raise exception 'Payment amount mismatch'; end if;
  update public.premium_checkouts set gateway_payment_id=coalesce(gateway_payment_id,p_payment_id),status=normalized,status_detail=p_detail,
    paid_at=case when normalized='APPROVED' then coalesce(paid_at,now()) else paid_at end,updated_at=now() where id=c.id;
  insert into public.premium_payment_events(checkout_id,gateway,gateway_event_id,status,amount_cents,processed_at)
  values(c.id,c.gateway,p_payment_id,normalized,p_amount_cents,now()) on conflict do nothing;
  if normalized='APPROVED' then
    gid:=public.premium_grant_access(c.user_id,c.plan_id,c.duration_days,'SUBSCRIPTION',p_payment_id,'subscription:'||p_payment_id,null,'Pagamento confirmado pelo gateway',null);
  elsif normalized in ('REFUNDED','CHARGEBACK') then
    update public.premium_grants set status='REVIEW_REQUIRED' where source_type='SUBSCRIPTION' and source_id=p_payment_id and status='ACTIVE';
    insert into public.premium_audit(action,entity,entity_id,after_state,origin) values('PAYMENT_REVIEW','premium_checkouts',c.id::text,jsonb_build_object('status',normalized),c.gateway);
  end if;
  return gid;
end $$;
revoke all on function public.premium_record_payment(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.premium_record_payment(uuid,text,text,integer,text) to service_role;
