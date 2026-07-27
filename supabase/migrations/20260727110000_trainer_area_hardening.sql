create index if not exists idx_trainer_exercises_exercise
  on public.trainer_plan_exercises(exercise_id);
create index if not exists idx_trainer_exercises_substitute
  on public.trainer_plan_exercises(substitute_exercise_id)
  where substitute_exercise_id is not null;
create index if not exists idx_trainer_assignments_template
  on public.trainer_plan_assignments(template_id);
create index if not exists idx_trainer_assignments_active_plan
  on public.trainer_plan_assignments(activated_plan_id)
  where activated_plan_id is not null;

drop policy if exists "Usuarios leem proprias funcoes especiais"
  on public.admin_usuario_roles;
create policy "Usuarios leem proprias funcoes especiais"
  on public.admin_usuario_roles for select to authenticated
  using (lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));

revoke all on function public.has_viva_leve_role(text) from anon;
revoke all on function public.is_viva_leve_trainer() from anon;
revoke all on function public.can_manage_training() from anon;
revoke all on function public.save_trainer_plan(jsonb) from anon;
revoke all on function public.assign_trainer_plan(uuid, text[]) from anon;
revoke all on function public.respond_trainer_plan_assignment(uuid, text) from anon;
