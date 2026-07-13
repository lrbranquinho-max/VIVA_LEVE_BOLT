drop policy if exists "Usuário lê próprio perfil" on public.perfis;
drop policy if exists "Usuario le proprio perfil" on public.perfis;
drop policy if exists "Usuarios leem proprio perfil ou admin" on public.perfis;

create policy "Usuarios leem proprio perfil ou admin"
on public.perfis for select to authenticated
using ((select auth.uid()) = id or public.is_viva_leve_admin());

drop policy if exists "Usuário lê próprio endereço" on public.perfis_clientes;
drop policy if exists "Usuario le proprio endereco" on public.perfis_clientes;
drop policy if exists "Usuarios leem proprio endereco ou admin" on public.perfis_clientes;

create policy "Usuarios leem proprio endereco ou admin"
on public.perfis_clientes for select to authenticated
using ((select auth.uid()) = id or public.is_viva_leve_admin());
