create table if not exists public.admin_usuario_roles (
  email text not null,
  role text not null check (role in ('admin', 'trainer')),
  nome text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (email, role)
);

insert into public.admin_usuario_roles (email, role, nome, ativo)
select lower(email), 'admin', nome, ativo
from public.admin_usuarios
on conflict (email, role) do update set
  nome = excluded.nome,
  ativo = excluded.ativo,
  atualizado_em = now();

alter table public.admin_usuario_roles enable row level security;

create or replace function public.has_viva_leve_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_usuario_roles roles
    where roles.ativo = true
      and roles.role = required_role
      and lower(roles.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.is_viva_leve_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_viva_leve_role('admin');
$$;

create or replace function public.is_viva_leve_trainer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_viva_leve_role('trainer');
$$;

create or replace function public.can_manage_training()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_viva_leve_admin() or public.is_viva_leve_trainer();
$$;

create or replace function public.get_access_options(lookup_email text)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct roles.role order by roles.role), array[]::text[])
  from public.admin_usuario_roles roles
  where roles.ativo = true
    and lower(roles.email) = lower(btrim(lookup_email));
$$;

drop policy if exists "Admins gerenciam funcoes especiais" on public.admin_usuario_roles;
drop policy if exists "Usuarios leem proprias funcoes especiais" on public.admin_usuario_roles;
create policy "Admins gerenciam funcoes especiais"
  on public.admin_usuario_roles for all to authenticated
  using (public.is_viva_leve_admin())
  with check (public.is_viva_leve_admin());
create policy "Usuarios leem proprias funcoes especiais"
  on public.admin_usuario_roles for select to authenticated
  using (lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));

create table if not exists public.trainer_plan_templates (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  level text not null default 'personalizado',
  duration_weeks integer not null default 8 check (duration_weeks between 1 and 52),
  weekly_frequency integer not null default 3 check (weekly_frequency between 1 and 7),
  cardio_recommendations text,
  schedule_notes text,
  general_notes text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_plan_days (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.trainer_plan_templates(id) on delete cascade,
  code text not null,
  title text not null,
  order_index integer not null,
  focus text,
  recommended_weekdays jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, code)
);

create table if not exists public.trainer_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  trainer_plan_day_id uuid not null references public.trainer_plan_days(id) on delete cascade,
  exercise_id bigint not null references public.exercise_catalog(id),
  substitute_exercise_id bigint references public.exercise_catalog(id) on delete set null,
  order_index integer not null,
  sets integer not null check (sets between 1 and 20),
  repetition_min integer not null check (repetition_min between 1 and 200),
  repetition_max integer not null check (repetition_max between repetition_min and 200),
  rest_seconds integer not null default 90 check (rest_seconds between 0 and 1800),
  load_guidance text,
  intensity_guidance text,
  technique text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.trainer_plan_templates(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  trainer_name text not null default 'Treinador',
  student_id uuid not null references auth.users(id) on delete cascade,
  student_email text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  activated_plan_id uuid references public.training_plans(id) on delete set null
);

create index if not exists idx_admin_usuario_roles_role
  on public.admin_usuario_roles(role, ativo);
create index if not exists idx_trainer_templates_owner
  on public.trainer_plan_templates(trainer_id, updated_at desc);
create index if not exists idx_trainer_days_template
  on public.trainer_plan_days(template_id, order_index);
create index if not exists idx_trainer_exercises_day
  on public.trainer_plan_exercises(trainer_plan_day_id, order_index);
create index if not exists idx_trainer_exercises_exercise
  on public.trainer_plan_exercises(exercise_id);
create index if not exists idx_trainer_exercises_substitute
  on public.trainer_plan_exercises(substitute_exercise_id)
  where substitute_exercise_id is not null;
create index if not exists idx_trainer_assignments_trainer
  on public.trainer_plan_assignments(trainer_id, sent_at desc);
create index if not exists idx_trainer_assignments_student
  on public.trainer_plan_assignments(student_id, status, sent_at desc);
create index if not exists idx_trainer_assignments_template
  on public.trainer_plan_assignments(template_id);
create index if not exists idx_trainer_assignments_active_plan
  on public.trainer_plan_assignments(activated_plan_id)
  where activated_plan_id is not null;
create unique index if not exists idx_trainer_assignments_pending_unique
  on public.trainer_plan_assignments(template_id, student_id)
  where status = 'pending';

alter table public.trainer_plan_templates enable row level security;
alter table public.trainer_plan_days enable row level security;
alter table public.trainer_plan_exercises enable row level security;
alter table public.trainer_plan_assignments enable row level security;

create policy "Gestores leem templates permitidos"
  on public.trainer_plan_templates for select to authenticated
  using (
    trainer_id = (select auth.uid())
    or public.is_viva_leve_admin()
    or exists (
      select 1 from public.trainer_plan_assignments assignment
      where assignment.template_id = id
        and assignment.student_id = (select auth.uid())
    )
  );
create policy "Gestores criam templates"
  on public.trainer_plan_templates for insert to authenticated
  with check (trainer_id = (select auth.uid()) and public.can_manage_training());
create policy "Gestores atualizam templates"
  on public.trainer_plan_templates for update to authenticated
  using (trainer_id = (select auth.uid()) or public.is_viva_leve_admin())
  with check (trainer_id = (select auth.uid()) or public.is_viva_leve_admin());
create policy "Gestores removem templates"
  on public.trainer_plan_templates for delete to authenticated
  using (trainer_id = (select auth.uid()) or public.is_viva_leve_admin());

create policy "Usuarios leem dias de templates permitidos"
  on public.trainer_plan_days for select to authenticated
  using (
    exists (
      select 1 from public.trainer_plan_templates template
      where template.id = template_id
        and (
          template.trainer_id = (select auth.uid())
          or public.is_viva_leve_admin()
          or exists (
            select 1 from public.trainer_plan_assignments assignment
            where assignment.template_id = template.id
              and assignment.student_id = (select auth.uid())
          )
        )
    )
  );
create policy "Gestores gerenciam dias de templates"
  on public.trainer_plan_days for all to authenticated
  using (
    exists (
      select 1 from public.trainer_plan_templates template
      where template.id = template_id
        and (template.trainer_id = (select auth.uid()) or public.is_viva_leve_admin())
    )
  )
  with check (
    exists (
      select 1 from public.trainer_plan_templates template
      where template.id = template_id
        and (template.trainer_id = (select auth.uid()) or public.is_viva_leve_admin())
    )
  );

create policy "Usuarios leem exercicios de templates permitidos"
  on public.trainer_plan_exercises for select to authenticated
  using (
    exists (
      select 1
      from public.trainer_plan_days day
      join public.trainer_plan_templates template on template.id = day.template_id
      where day.id = trainer_plan_day_id
        and (
          template.trainer_id = (select auth.uid())
          or public.is_viva_leve_admin()
          or exists (
            select 1 from public.trainer_plan_assignments assignment
            where assignment.template_id = template.id
              and assignment.student_id = (select auth.uid())
          )
        )
    )
  );
create policy "Gestores gerenciam exercicios de templates"
  on public.trainer_plan_exercises for all to authenticated
  using (
    exists (
      select 1
      from public.trainer_plan_days day
      join public.trainer_plan_templates template on template.id = day.template_id
      where day.id = trainer_plan_day_id
        and (template.trainer_id = (select auth.uid()) or public.is_viva_leve_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.trainer_plan_days day
      join public.trainer_plan_templates template on template.id = day.template_id
      where day.id = trainer_plan_day_id
        and (template.trainer_id = (select auth.uid()) or public.is_viva_leve_admin())
    )
  );

create policy "Treinadores leem proprias atribuicoes"
  on public.trainer_plan_assignments for select to authenticated
  using (
    trainer_id = (select auth.uid())
    or student_id = (select auth.uid())
    or public.is_viva_leve_admin()
  );
create policy "Treinadores criam atribuicoes"
  on public.trainer_plan_assignments for insert to authenticated
  with check (
    trainer_id = (select auth.uid())
    and public.can_manage_training()
  );
create policy "Treinadores atualizam proprias atribuicoes"
  on public.trainer_plan_assignments for update to authenticated
  using (trainer_id = (select auth.uid()) or public.is_viva_leve_admin())
  with check (trainer_id = (select auth.uid()) or public.is_viva_leve_admin());

create or replace function public.save_trainer_plan(plan_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  v_template_id uuid;
  day_id uuid;
  day_payload jsonb;
  exercise_payload jsonb;
  day_count integer := 0;
  exercise_count integer := 0;
  day_exercise_count integer := 0;
begin
  if current_user_id is null or not public.can_manage_training() then
    raise exception 'Acesso restrito a treinadores e administradores.';
  end if;

  if btrim(coalesce(plan_payload ->> 'name', '')) = '' then
    raise exception 'Informe o nome do plano.';
  end if;

  v_template_id := nullif(plan_payload ->> 'id', '')::uuid;
  if v_template_id is null then
    insert into public.trainer_plan_templates (
      trainer_id, name, level, duration_weeks, weekly_frequency,
      cardio_recommendations, schedule_notes, general_notes, status
    ) values (
      current_user_id,
      btrim(plan_payload ->> 'name'),
      coalesce(nullif(plan_payload ->> 'level', ''), 'personalizado'),
      greatest(1, least(52, coalesce((plan_payload ->> 'duration_weeks')::integer, 8))),
      greatest(1, least(7, coalesce((plan_payload ->> 'weekly_frequency')::integer, 3))),
      nullif(btrim(plan_payload ->> 'cardio_recommendations'), ''),
      nullif(btrim(plan_payload ->> 'schedule_notes'), ''),
      nullif(btrim(plan_payload ->> 'general_notes'), ''),
      'published'
    )
    returning id into v_template_id;
  else
    if not exists (
      select 1 from public.trainer_plan_templates template
      where template.id = v_template_id
        and (template.trainer_id = current_user_id or public.is_viva_leve_admin())
    ) then
      raise exception 'Plano não encontrado ou sem permissão.';
    end if;

    update public.trainer_plan_templates set
      name = btrim(plan_payload ->> 'name'),
      level = coalesce(nullif(plan_payload ->> 'level', ''), 'personalizado'),
      duration_weeks = greatest(1, least(52, coalesce((plan_payload ->> 'duration_weeks')::integer, 8))),
      weekly_frequency = greatest(1, least(7, coalesce((plan_payload ->> 'weekly_frequency')::integer, 3))),
      cardio_recommendations = nullif(btrim(plan_payload ->> 'cardio_recommendations'), ''),
      schedule_notes = nullif(btrim(plan_payload ->> 'schedule_notes'), ''),
      general_notes = nullif(btrim(plan_payload ->> 'general_notes'), ''),
      status = 'published',
      updated_at = now()
    where id = v_template_id;

    delete from public.trainer_plan_days day where day.template_id = v_template_id;
  end if;

  for day_payload in
    select value from jsonb_array_elements(coalesce(plan_payload -> 'days', '[]'::jsonb))
  loop
    day_count := day_count + 1;
    insert into public.trainer_plan_days (
      template_id, code, title, order_index, focus, recommended_weekdays
    ) values (
      v_template_id,
      coalesce(nullif(btrim(day_payload ->> 'code'), ''), chr(64 + day_count)),
      coalesce(nullif(btrim(day_payload ->> 'title'), ''), 'Treino ' || chr(64 + day_count)),
      day_count,
      nullif(btrim(day_payload ->> 'focus'), ''),
      coalesce(day_payload -> 'recommended_weekdays', '[]'::jsonb)
    )
    returning id into day_id;

    day_exercise_count := 0;
    for exercise_payload in
      select value from jsonb_array_elements(coalesce(day_payload -> 'exercises', '[]'::jsonb))
    loop
      exercise_count := exercise_count + 1;
      day_exercise_count := day_exercise_count + 1;
      insert into public.trainer_plan_exercises (
        trainer_plan_day_id, exercise_id, substitute_exercise_id, order_index,
        sets, repetition_min, repetition_max, rest_seconds,
        load_guidance, intensity_guidance, technique, notes
      ) values (
        day_id,
        (exercise_payload ->> 'exercise_id')::bigint,
        nullif(exercise_payload ->> 'substitute_exercise_id', '')::bigint,
        day_exercise_count,
        greatest(1, least(20, coalesce((exercise_payload ->> 'sets')::integer, 3))),
        greatest(1, least(200, coalesce((exercise_payload ->> 'repetition_min')::integer, 8))),
        greatest(
          greatest(1, least(200, coalesce((exercise_payload ->> 'repetition_min')::integer, 8))),
          least(200, coalesce((exercise_payload ->> 'repetition_max')::integer, 12))
        ),
        greatest(0, least(1800, coalesce((exercise_payload ->> 'rest_seconds')::integer, 90))),
        nullif(btrim(exercise_payload ->> 'load_guidance'), ''),
        nullif(btrim(exercise_payload ->> 'intensity_guidance'), ''),
        nullif(btrim(exercise_payload ->> 'technique'), ''),
        nullif(btrim(exercise_payload ->> 'notes'), '')
      );
    end loop;
  end loop;

  if day_count = 0 or exercise_count = 0 then
    raise exception 'O plano precisa ter ao menos um treino e um exercício.';
  end if;

  return v_template_id;
end;
$$;

create or replace function public.assign_trainer_plan(target_template_id uuid, target_emails text[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  requested_email text;
  found_user record;
  trainer_display_name text;
  assigned_emails text[] := array[]::text[];
  missing_emails text[] := array[]::text[];
begin
  if current_user_id is null or not public.can_manage_training() then
    raise exception 'Acesso restrito a treinadores e administradores.';
  end if;

  if not exists (
    select 1 from public.trainer_plan_templates template
    where template.id = target_template_id
      and template.status = 'published'
      and (template.trainer_id = current_user_id or public.is_viva_leve_admin())
  ) then
    raise exception 'Plano não encontrado, não publicado ou sem permissão.';
  end if;

  select coalesce(
    nullif(max(roles.nome) filter (where roles.nome <> ''), ''),
    nullif(auth.jwt() ->> 'email', ''),
    'Treinador'
  )
  into trainer_display_name
  from public.admin_usuario_roles roles
  where lower(roles.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and roles.ativo = true;

  foreach requested_email in array coalesce(target_emails, array[]::text[])
  loop
    requested_email := lower(btrim(requested_email));
    select users.id, users.email
    into found_user
    from auth.users users
    where lower(users.email) = requested_email
      and not exists (
        select 1 from public.admin_usuario_roles roles
        where lower(roles.email) = requested_email and roles.ativo = true
      )
    limit 1;

    if found_user.id is null then
      missing_emails := array_append(missing_emails, requested_email);
    else
      if exists (
        select 1 from public.trainer_plan_assignments assignment
        where assignment.template_id = target_template_id
          and assignment.student_id = found_user.id
          and assignment.status = 'pending'
      ) then
        update public.trainer_plan_assignments set
          sent_at = now(),
          trainer_name = trainer_display_name,
          student_email = found_user.email
        where template_id = target_template_id
          and student_id = found_user.id
          and status = 'pending';
      else
        insert into public.trainer_plan_assignments (
          template_id, trainer_id, trainer_name, student_id, student_email
        ) values (
          target_template_id, current_user_id, trainer_display_name, found_user.id, found_user.email
        );
      end if;
      assigned_emails := array_append(assigned_emails, found_user.email);
    end if;
  end loop;

  return jsonb_build_object(
    'assigned', to_jsonb(assigned_emails),
    'not_found', to_jsonb(missing_emails)
  );
end;
$$;

create or replace function public.respond_trainer_plan_assignment(
  target_assignment_id uuid,
  response text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  assignment_record public.trainer_plan_assignments%rowtype;
  template_record public.trainer_plan_templates%rowtype;
  source_day record;
  target_day_id uuid;
  target_plan_id uuid;
  student_profile_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;
  if response not in ('accepted', 'rejected') then
    raise exception 'Resposta inválida.';
  end if;

  select * into assignment_record
  from public.trainer_plan_assignments
  where id = target_assignment_id
    and student_id = current_user_id
    and status = 'pending'
  for update;

  if assignment_record.id is null then
    raise exception 'Convite não encontrado ou já respondido.';
  end if;

  if response = 'rejected' then
    update public.trainer_plan_assignments
    set status = 'rejected', responded_at = now()
    where id = target_assignment_id;
    return null;
  end if;

  select * into template_record
  from public.trainer_plan_templates
  where id = assignment_record.template_id
    and status = 'published';
  if template_record.id is null then
    raise exception 'O plano enviado não está mais disponível.';
  end if;

  select id into student_profile_id
  from public.training_profiles
  where user_id = current_user_id;

  update public.training_plans
  set status = 'archived', updated_at = now()
  where user_id = current_user_id
    and status in ('active', 'paused');

  insert into public.training_plans (
    user_id, profile_id, level, name, start_date, expected_end_date,
    duration_weeks, current_week, weekly_frequency, status,
    generated_by_ai, generation_version, generation_payload, cardio_payload
  ) values (
    current_user_id,
    student_profile_id,
    template_record.level,
    template_record.name,
    current_date,
    current_date + (template_record.duration_weeks * 7),
    template_record.duration_weeks,
    1,
    template_record.weekly_frequency,
    'active',
    false,
    'trainer-manual-v1',
    jsonb_build_object(
      'source', 'trainer',
      'template_id', template_record.id,
      'trainer_id', template_record.trainer_id,
      'trainer_name', assignment_record.trainer_name,
      'schedule_notes', template_record.schedule_notes,
      'general_notes', template_record.general_notes
    ),
    jsonb_build_object(
      'source', 'trainer',
      'recommendations', coalesce(template_record.cardio_recommendations, '')
    )
  )
  returning id into target_plan_id;

  for source_day in
    select * from public.trainer_plan_days
    where template_id = template_record.id
    order by order_index
  loop
    insert into public.training_days (
      training_plan_id, code, title, order_index, focus, recommended_weekdays
    ) values (
      target_plan_id, source_day.code, source_day.title,
      source_day.order_index, source_day.focus, source_day.recommended_weekdays
    )
    returning id into target_day_id;

    insert into public.training_day_exercises (
      training_day_id, exercise_id, substitute_exercise_id, order_index,
      sets, repetition_min, repetition_max, rest_seconds,
      advanced_technique, advanced_technique_instructions, notes
    )
    select
      target_day_id,
      exercise.exercise_id,
      exercise.substitute_exercise_id,
      exercise.order_index,
      exercise.sets,
      exercise.repetition_min,
      exercise.repetition_max,
      exercise.rest_seconds,
      exercise.technique,
      exercise.intensity_guidance,
      concat_ws(
        E'\n',
        nullif('Carga: ' || coalesce(exercise.load_guidance, ''), 'Carga: '),
        exercise.notes
      )
    from public.trainer_plan_exercises exercise
    where exercise.trainer_plan_day_id = source_day.id
    order by exercise.order_index;
  end loop;

  update public.trainer_plan_assignments
  set
    status = 'accepted',
    responded_at = now(),
    activated_plan_id = target_plan_id
  where id = target_assignment_id;

  return target_plan_id;
end;
$$;

create policy "Treinadores leem planos vinculados"
  on public.training_plans for select to authenticated
  using (
    exists (
      select 1 from public.trainer_plan_assignments assignment
      where assignment.activated_plan_id = id
        and assignment.trainer_id = (select auth.uid())
    )
  );
create policy "Treinadores leem dias vinculados"
  on public.training_days for select to authenticated
  using (
    exists (
      select 1
      from public.trainer_plan_assignments assignment
      where assignment.activated_plan_id = training_plan_id
        and assignment.trainer_id = (select auth.uid())
    )
  );
create policy "Treinadores leem exercicios vinculados"
  on public.training_day_exercises for select to authenticated
  using (
    exists (
      select 1
      from public.training_days day
      join public.trainer_plan_assignments assignment
        on assignment.activated_plan_id = day.training_plan_id
      where day.id = training_day_id
        and assignment.trainer_id = (select auth.uid())
    )
  );
create policy "Treinadores leem sessoes vinculadas"
  on public.training_sessions for select to authenticated
  using (
    exists (
      select 1 from public.trainer_plan_assignments assignment
      where assignment.activated_plan_id = training_plan_id
        and assignment.trainer_id = (select auth.uid())
    )
  );
create policy "Treinadores leem execucoes vinculadas"
  on public.training_session_exercises for select to authenticated
  using (
    exists (
      select 1
      from public.training_sessions session
      join public.trainer_plan_assignments assignment
        on assignment.activated_plan_id = session.training_plan_id
      where session.id = training_session_id
        and assignment.trainer_id = (select auth.uid())
    )
  );
create policy "Treinadores leem perfis de alunos vinculados"
  on public.perfis for select to authenticated
  using (
    exists (
      select 1 from public.trainer_plan_assignments assignment
      where assignment.student_id = id
        and assignment.trainer_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.admin_usuario_roles to authenticated;
grant select, insert, update, delete on public.trainer_plan_templates to authenticated;
grant select, insert, update, delete on public.trainer_plan_days to authenticated;
grant select, insert, update, delete on public.trainer_plan_exercises to authenticated;
grant select, insert, update on public.trainer_plan_assignments to authenticated;

revoke all on function public.has_viva_leve_role(text) from public;
revoke all on function public.is_viva_leve_trainer() from public;
revoke all on function public.can_manage_training() from public;
revoke all on function public.save_trainer_plan(jsonb) from public;
revoke all on function public.assign_trainer_plan(uuid, text[]) from public;
revoke all on function public.respond_trainer_plan_assignment(uuid, text) from public;
revoke all on function public.get_access_options(text) from public;
revoke all on function public.has_viva_leve_role(text) from anon;
revoke all on function public.is_viva_leve_trainer() from anon;
revoke all on function public.can_manage_training() from anon;
revoke all on function public.save_trainer_plan(jsonb) from anon;
revoke all on function public.assign_trainer_plan(uuid, text[]) from anon;
revoke all on function public.respond_trainer_plan_assignment(uuid, text) from anon;
grant execute on function public.has_viva_leve_role(text) to authenticated;
grant execute on function public.is_viva_leve_trainer() to authenticated;
grant execute on function public.can_manage_training() to authenticated;
grant execute on function public.save_trainer_plan(jsonb) to authenticated;
grant execute on function public.assign_trainer_plan(uuid, text[]) to authenticated;
grant execute on function public.respond_trainer_plan_assignment(uuid, text) to authenticated;
grant execute on function public.get_access_options(text) to anon, authenticated;

comment on table public.admin_usuario_roles is
  'Funções especiais acumuláveis por e-mail: administrador e treinador.';
comment on table public.trainer_plan_templates is
  'Planos manuais reutilizáveis criados por treinadores.';
comment on table public.trainer_plan_assignments is
  'Convites de planos enviados a alunos, com aceite antes da ativação.';
