drop policy if exists "Publico le imagens produtos viva leve" on storage.objects;
drop policy if exists "Admins enviam imagens produtos viva leve" on storage.objects;
drop policy if exists "Admins atualizam imagens produtos viva leve" on storage.objects;
drop policy if exists "Admins removem imagens produtos viva leve" on storage.objects;

create policy "Publico le imagens produtos viva leve"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'produtos-viva-leve');

create policy "Admins enviam imagens produtos viva leve"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'produtos-viva-leve'
  and public.is_viva_leve_admin()
);

create policy "Admins atualizam imagens produtos viva leve"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'produtos-viva-leve'
  and public.is_viva_leve_admin()
)
with check (
  bucket_id = 'produtos-viva-leve'
  and public.is_viva_leve_admin()
);

create policy "Admins removem imagens produtos viva leve"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'produtos-viva-leve'
  and public.is_viva_leve_admin()
);
