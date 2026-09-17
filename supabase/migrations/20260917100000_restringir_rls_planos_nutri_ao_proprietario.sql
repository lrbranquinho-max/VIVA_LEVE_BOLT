-- Remove politicas legadas amplas. O fluxo automatico continua disponivel ao
-- proprietario da requisicao e o painel continua disponivel aos admins.

drop policy if exists "Acesso autenticado requisicoes" on public.planos_requisicoes;
drop policy if exists "Acesso autenticado planos gerados" on public.planos_gerados;

drop policy if exists "Usuarios criam propria requisicao nutri" on public.planos_requisicoes;
create policy "Usuarios criam propria requisicao nutri"
on public.planos_requisicoes for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Usuarios leem proprias requisicoes nutri" on public.planos_requisicoes;
create policy "Usuarios leem proprias requisicoes nutri"
on public.planos_requisicoes for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Usuarios concluem proprias requisicoes nutri automaticas" on public.planos_requisicoes;
create policy "Usuarios concluem proprias requisicoes nutri automaticas"
on public.planos_requisicoes for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id and status = 'concluido');

drop policy if exists "Usuarios leem proprios planos nutri" on public.planos_gerados;
create policy "Usuarios leem proprios planos nutri"
on public.planos_gerados for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Usuarios inserem proprios planos nutri automaticos" on public.planos_gerados;
create policy "Usuarios inserem proprios planos nutri automaticos"
on public.planos_gerados for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.planos_requisicoes r
    where r.id = requisicao_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "Usuarios atualizam proprios planos nutri" on public.planos_gerados;
create policy "Usuarios atualizam proprios planos nutri"
on public.planos_gerados for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
