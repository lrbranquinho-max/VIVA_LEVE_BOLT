-- Plano Nutri com IA: requisicoes, planos aprovados e storage de receitas.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('receitas_nutri', 'receitas_nutri', true)
on conflict (id) do update set public = excluded.public;

create table if not exists public.planos_requisicoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  objetivo text not null check (objetivo in ('Perda de Peso', 'Manutencao', 'Ganho de Massa')),
  receita_url text,
  preferencias jsonb not null default '{}'::jsonb,
  padrao_refeicoes jsonb not null default '{}'::jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'em_revisao', 'concluido', 'erro')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.planos_gerados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requisicao_id uuid not null references public.planos_requisicoes(id) on delete cascade,
  data_plano date not null default current_date,
  objetivo_estabelecido text not null,
  kcal_diaria_meta numeric not null default 2000,
  plano_semanal jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists planos_requisicoes_user_status_idx
  on public.planos_requisicoes (user_id, status, criado_em desc);

create index if not exists planos_gerados_user_data_idx
  on public.planos_gerados (user_id, data_plano desc);

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists set_planos_requisicoes_atualizado_em on public.planos_requisicoes;
create trigger set_planos_requisicoes_atualizado_em
before update on public.planos_requisicoes
for each row execute function public.set_atualizado_em();

drop trigger if exists set_planos_gerados_atualizado_em on public.planos_gerados;
create trigger set_planos_gerados_atualizado_em
before update on public.planos_gerados
for each row execute function public.set_atualizado_em();

alter table public.planos_requisicoes enable row level security;
alter table public.planos_gerados enable row level security;

drop policy if exists "Usuarios criam propria requisicao nutri" on public.planos_requisicoes;
drop policy if exists "Usuarios leem proprias requisicoes nutri" on public.planos_requisicoes;
drop policy if exists "Admins gerenciam requisicoes nutri" on public.planos_requisicoes;

create policy "Usuarios criam propria requisicao nutri"
on public.planos_requisicoes for insert to authenticated
with check (auth.uid() = user_id);

create policy "Usuarios leem proprias requisicoes nutri"
on public.planos_requisicoes for select to authenticated
using (auth.uid() = user_id);

create policy "Admins gerenciam requisicoes nutri"
on public.planos_requisicoes for all to authenticated
using (public.is_viva_leve_admin())
with check (public.is_viva_leve_admin());

drop policy if exists "Usuarios leem proprios planos nutri" on public.planos_gerados;
drop policy if exists "Admins gerenciam planos nutri" on public.planos_gerados;

create policy "Usuarios leem proprios planos nutri"
on public.planos_gerados for select to authenticated
using (auth.uid() = user_id);

create policy "Admins gerenciam planos nutri"
on public.planos_gerados for all to authenticated
using (public.is_viva_leve_admin())
with check (public.is_viva_leve_admin());

drop policy if exists "Usuarios enviam receitas nutri" on storage.objects;
drop policy if exists "Usuarios leem proprias receitas nutri" on storage.objects;
drop policy if exists "Admins leem receitas nutri" on storage.objects;

create policy "Usuarios enviam receitas nutri"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receitas_nutri'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "Usuarios leem proprias receitas nutri"
on storage.objects for select to authenticated
using (
  bucket_id = 'receitas_nutri'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "Admins leem receitas nutri"
on storage.objects for select to authenticated
using (
  bucket_id = 'receitas_nutri'
  and public.is_viva_leve_admin()
);
