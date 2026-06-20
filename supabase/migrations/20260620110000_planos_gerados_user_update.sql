drop policy if exists "Usuarios atualizam proprios planos nutri" on public.planos_gerados;

create policy "Usuarios atualizam proprios planos nutri"
on public.planos_gerados for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
