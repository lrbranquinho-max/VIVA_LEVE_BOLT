create table if not exists public.app_config (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

insert into public.app_config (chave, valor)
values ('plano_nutri_modo', '{"modo":"manual"}'::jsonb)
on conflict (chave) do nothing;

alter table public.app_config enable row level security;

drop policy if exists "Usuarios autenticados leem configuracoes" on public.app_config;
drop policy if exists "Admins gerenciam configuracoes" on public.app_config;

create policy "Usuarios autenticados leem configuracoes"
on public.app_config for select to authenticated
using (true);

create policy "Admins gerenciam configuracoes"
on public.app_config for all to authenticated
using (public.is_viva_leve_admin())
with check (public.is_viva_leve_admin());

drop trigger if exists set_app_config_atualizado_em on public.app_config;
create trigger set_app_config_atualizado_em
before update on public.app_config
for each row execute function public.set_atualizado_em();
