drop policy if exists "Usuarios inserem proprios planos nutri automaticos" on public.planos_gerados;
drop policy if exists "Usuarios concluem proprias requisicoes nutri automaticas" on public.planos_requisicoes;

create policy "Usuarios inserem proprios planos nutri automaticos"
on public.planos_gerados for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.planos_requisicoes r
    where r.id = requisicao_id
      and r.user_id = auth.uid()
  )
);

create policy "Usuarios concluem proprias requisicoes nutri automaticas"
on public.planos_requisicoes for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and status = 'concluido'
);
