-- Tokens nativos do Capacitor/FCM. O token pertence ao usuário autenticado;
-- credenciais privadas do Firebase permanecem somente nos Secrets das Edge Functions.
create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 4096),
  plataforma text not null check (plataforma in ('android','ios')),
  device_info text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists native_push_tokens_user_active_idx
  on public.native_push_tokens(user_id) where ativo;

alter table public.native_push_tokens enable row level security;
drop policy if exists "Usuarios leem proprios tokens nativos" on public.native_push_tokens;
create policy "Usuarios leem proprios tokens nativos"
  on public.native_push_tokens for select to authenticated
  using ((select auth.uid())=user_id);
drop policy if exists "Usuarios removem proprios tokens nativos" on public.native_push_tokens;
create policy "Usuarios removem proprios tokens nativos"
  on public.native_push_tokens for delete to authenticated
  using ((select auth.uid())=user_id);

grant select,delete on public.native_push_tokens to authenticated;
grant all on public.native_push_tokens to service_role;

create or replace function public.salvar_push_token_nativo(p_token text,p_plataforma text,p_device_info text default null)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_token text:=btrim(coalesce(p_token,'')); v_plataforma text:=lower(btrim(coalesce(p_plataforma,'')));
begin
  if auth.uid() is null then raise exception 'Faça login para ativar notificações.' using errcode='42501'; end if;
  if char_length(v_token) not between 20 and 4096 then raise exception 'Token de notificação inválido.' using errcode='22023'; end if;
  if v_plataforma not in ('android','ios') then raise exception 'Plataforma de notificação inválida.' using errcode='22023'; end if;
  insert into public.native_push_tokens(user_id,token,plataforma,device_info,ativo,atualizado_em)
  values(auth.uid(),v_token,v_plataforma,left(p_device_info,500),true,now())
  on conflict(token) do update set user_id=excluded.user_id,plataforma=excluded.plataforma,
    device_info=excluded.device_info,ativo=true,atualizado_em=now();
end;
$$;
revoke all on function public.salvar_push_token_nativo(text,text,text) from public,anon;
grant execute on function public.salvar_push_token_nativo(text,text,text) to authenticated;

alter table public.notification_deliveries
  add column if not exists fcm_enviados integer not null default 0,
  add column if not exists fcm_falhos integer not null default 0;
