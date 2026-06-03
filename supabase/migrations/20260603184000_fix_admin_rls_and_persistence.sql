/*
  # Fix admin persistence with RLS

  Admin writes were returning success in the UI while RLS affected zero rows.
  This migration creates a small admin allowlist and rewrites the policies used
  by pedidos/produtos/perfis so the client app can persist admin operations only
  for approved admin e-mails.

  After running this migration, add the real admin e-mail if it is not one of
  the seeded defaults:

    INSERT INTO public.admin_usuarios (email, nome)
    VALUES ('seu-email-de-login@dominio.com', 'Administrador')
    ON CONFLICT (email) DO NOTHING;
*/

CREATE TABLE IF NOT EXISTS public.admin_usuarios (
  email text PRIMARY KEY,
  nome text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.admin_usuarios (email, nome)
VALUES
  ('admin@vivaleve.com.br', 'Admin Viva Leve'),
  ('dono@vivaleve.com.br', 'Dono Viva Leve'),
  ('gerencia@vivaleve.com.br', 'Gerencia Viva Leve')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE public.admin_usuarios ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_viva_leve_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_usuarios
    WHERE ativo = true
      AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

DROP POLICY IF EXISTS "Admins can read admin_usuarios" ON public.admin_usuarios;
DROP POLICY IF EXISTS "Admins can manage admin_usuarios" ON public.admin_usuarios;

CREATE POLICY "Admins can read admin_usuarios"
  ON public.admin_usuarios FOR SELECT TO authenticated
  USING (public.is_viva_leve_admin());

CREATE POLICY "Admins can manage admin_usuarios"
  ON public.admin_usuarios FOR ALL TO authenticated
  USING (public.is_viva_leve_admin())
  WITH CHECK (public.is_viva_leve_admin());

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read all pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Admins can update pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Authenticated users can update pedidos status" ON public.pedidos;
DROP POLICY IF EXISTS "Authenticated can read all pedidos" ON public.pedidos;

CREATE POLICY "Admins can read all pedidos"
  ON public.pedidos FOR SELECT TO authenticated
  USING (public.is_viva_leve_admin());

CREATE POLICY "Admins can update pedidos"
  ON public.pedidos FOR UPDATE TO authenticated
  USING (public.is_viva_leve_admin())
  WITH CHECK (public.is_viva_leve_admin());

DROP POLICY IF EXISTS "Admins can read all produtos" ON public.produtos;
DROP POLICY IF EXISTS "Admins can insert produtos" ON public.produtos;
DROP POLICY IF EXISTS "Admins can update produtos" ON public.produtos;
DROP POLICY IF EXISTS "Admins can delete produtos" ON public.produtos;
DROP POLICY IF EXISTS "Public can read active produtos" ON public.produtos;

CREATE POLICY "Public can read active produtos"
  ON public.produtos FOR SELECT TO anon, authenticated
  USING (ativo = true OR public.is_viva_leve_admin());

CREATE POLICY "Admins can read all produtos"
  ON public.produtos FOR SELECT TO authenticated
  USING (public.is_viva_leve_admin());

CREATE POLICY "Admins can insert produtos"
  ON public.produtos FOR INSERT TO authenticated
  WITH CHECK (public.is_viva_leve_admin());

CREATE POLICY "Admins can update produtos"
  ON public.produtos FOR UPDATE TO authenticated
  USING (public.is_viva_leve_admin())
  WITH CHECK (public.is_viva_leve_admin());

CREATE POLICY "Admins can delete produtos"
  ON public.produtos FOR DELETE TO authenticated
  USING (public.is_viva_leve_admin());

DROP POLICY IF EXISTS "Usuário lê próprio perfil" ON public.perfis;
DROP POLICY IF EXISTS "Usuario le proprio perfil" ON public.perfis;
DROP POLICY IF EXISTS "Usu rio lˆ pr¢prio perfil" ON public.perfis;

CREATE POLICY "Usuário lê próprio perfil"
  ON public.perfis FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_viva_leve_admin());

DROP POLICY IF EXISTS "Usuário lê próprio endereço" ON public.perfis_clientes;
DROP POLICY IF EXISTS "Usuario le proprio endereco" ON public.perfis_clientes;
DROP POLICY IF EXISTS "Usu rio lˆ pr¢prio endere‡o" ON public.perfis_clientes;

CREATE POLICY "Usuário lê próprio endereço"
  ON public.perfis_clientes FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_viva_leve_admin());
