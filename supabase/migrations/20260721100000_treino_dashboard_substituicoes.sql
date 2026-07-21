alter table public.exercise_catalog
  add column if not exists similarity_group text;

update public.exercise_catalog
set similarity_group = lower(regexp_replace(
  coalesce(primary_muscle_group, '') || '|' || coalesce(movement_pattern, ''),
  '[^[:alnum:]]+', '-', 'g'
))
where similarity_group is null or btrim(similarity_group) = '';

create index if not exists idx_exercise_catalog_similarity_group
  on public.exercise_catalog(similarity_group)
  where is_active = true;

create table if not exists public.exercise_substitutions (
  id bigint generated always as identity primary key,
  exercise_id bigint not null references public.exercise_catalog(id) on delete cascade,
  substitute_exercise_id bigint not null references public.exercise_catalog(id) on delete cascade,
  reason text not null default 'Mesmo grupo muscular e padrao de movimento, com equipamento alternativo.',
  priority integer not null default 100,
  source_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_substitutions_different check (exercise_id <> substitute_exercise_id),
  constraint exercise_substitutions_unique unique (exercise_id, substitute_exercise_id)
);

create index if not exists idx_exercise_substitutions_exercise
  on public.exercise_substitutions(exercise_id, priority)
  where is_active = true;
create index if not exists idx_exercise_substitutions_substitute
  on public.exercise_substitutions(substitute_exercise_id);

alter table public.exercise_substitutions enable row level security;

drop policy if exists "Usuarios leem substituicoes de exercicios" on public.exercise_substitutions;
drop policy if exists "Admins gerenciam substituicoes de exercicios" on public.exercise_substitutions;
drop policy if exists "Admins criam substituicoes de exercicios" on public.exercise_substitutions;
drop policy if exists "Admins atualizam substituicoes de exercicios" on public.exercise_substitutions;
drop policy if exists "Admins removem substituicoes de exercicios" on public.exercise_substitutions;
create policy "Usuarios leem substituicoes de exercicios"
  on public.exercise_substitutions for select to authenticated
  using (is_active = true or public.is_viva_leve_admin());
create policy "Admins criam substituicoes de exercicios"
  on public.exercise_substitutions for insert to authenticated
  with check (public.is_viva_leve_admin());
create policy "Admins atualizam substituicoes de exercicios"
  on public.exercise_substitutions for update to authenticated
  using (public.is_viva_leve_admin())
  with check (public.is_viva_leve_admin());
create policy "Admins removem substituicoes de exercicios"
  on public.exercise_substitutions for delete to authenticated
  using (public.is_viva_leve_admin());

grant select on table public.exercise_substitutions to authenticated;
grant insert, update, delete on table public.exercise_substitutions to authenticated;
grant usage, select on sequence public.exercise_substitutions_id_seq to authenticated;

insert into public.exercise_substitutions (
  exercise_id,
  substitute_exercise_id,
  reason,
  priority,
  source_url
)
select
  original.id,
  substitute.id,
  'Mesmo grupo muscular principal e padrao de movimento, com equipamento diferente.',
  100,
  'https://www.nsca.com/education/articles/ptq/teaching-resistance-training-movement-patterns/'
from public.exercise_catalog original
join public.exercise_catalog substitute
  on substitute.similarity_group = original.similarity_group
 and substitute.id <> original.id
 and coalesce(lower(substitute.equipment), '') <> coalesce(lower(original.equipment), '')
where original.similarity_group is not null
  and original.similarity_group <> ''
on conflict (exercise_id, substitute_exercise_id) do update set
  reason = excluded.reason,
  priority = excluded.priority,
  source_url = excluded.source_url,
  is_active = true,
  updated_at = now();

alter table public.training_day_exercises
  add column if not exists substitute_exercise_id bigint references public.exercise_catalog(id) on delete set null;

create index if not exists idx_training_day_exercises_substitute
  on public.training_day_exercises(substitute_exercise_id)
  where substitute_exercise_id is not null;
create index if not exists idx_training_day_exercises_exercise
  on public.training_day_exercises(exercise_id);
create index if not exists idx_training_sessions_user_completed
  on public.training_sessions(user_id, completed_at desc)
  where status = 'completed';
create index if not exists idx_training_sessions_day
  on public.training_sessions(training_day_id);
create index if not exists idx_training_session_exercises_session
  on public.training_session_exercises(training_session_id);
create index if not exists idx_training_session_exercises_prescription
  on public.training_session_exercises(training_day_exercise_id);

update public.training_day_exercises target
set substitute_exercise_id = (
  select substitutions.substitute_exercise_id
  from public.exercise_substitutions substitutions
  where substitutions.exercise_id = target.exercise_id
    and substitutions.is_active = true
    and not exists (
      select 1
      from public.training_day_exercises selected
      where selected.training_day_id = target.training_day_id
        and selected.exercise_id = substitutions.substitute_exercise_id
    )
  order by substitutions.priority, substitutions.substitute_exercise_id
  limit 1
)
where target.substitute_exercise_id is null;

comment on column public.exercise_catalog.similarity_group is
  'Agrupa variacoes do mesmo padrao motor para impedir redundancia no mesmo treino.';
comment on table public.exercise_substitutions is
  'Alternativas equivalentes para aparelhos ocupados ou indisponiveis.';

update public.app_config
set valor = jsonb_set(valor, '{generation_version}', '"treino-v2"'::jsonb, true),
    atualizado_em = now()
where chave = 'training_settings';
