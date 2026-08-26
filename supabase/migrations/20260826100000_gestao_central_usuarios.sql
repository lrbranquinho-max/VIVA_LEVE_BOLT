-- Called only by the authenticated admin API with the server-side service role.
-- Aluno remains the ordinary account, not an administrative permission.
create or replace function public.admin_salvar_perfis_usuario(
  p_ator_id uuid,
  p_usuario_id uuid,
  p_nome text,
  p_telefone text,
  p_observacoes text,
  p_perfis text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  perform pg_advisory_xact_lock(hashtext('viva_leve_gestao_usuarios'));
  if p_ator_id is null or not exists (
    select 1 from auth.users u
    join public.admin_usuario_roles r on lower(r.email) = lower(u.email)
    where u.id = p_ator_id and r.role = 'admin' and r.ativo
  ) then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;

  if p_perfis is null or cardinality(p_perfis) = 0
     or cardinality(p_perfis) > 4 or array_position(p_perfis, null) is not null
     or not p_perfis <@ array['student', 'admin', 'trainer', 'delivery']::text[]
     or ('student' = any(p_perfis) and cardinality(p_perfis) > 1) then
    raise exception 'Perfis de acesso invalidos.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_nome, ''))) < 2 or length(p_nome) > 160
     or length(coalesce(p_telefone, '')) > 30 or length(coalesce(p_observacoes, '')) > 2000 then
    raise exception 'Dados de cadastro invalidos.' using errcode = '22023';
  end if;
  if p_ator_id = p_usuario_id and not 'admin' = any(p_perfis) then
    raise exception 'Voce nao pode remover o proprio acesso administrativo.' using errcode = '42501';
  end if;

  select lower(email) into v_email from auth.users where id = p_usuario_id for update;
  if not found or v_email is null then
    raise exception 'Usuario nao encontrado.' using errcode = 'P0002';
  end if;

  insert into public.perfis (id, nome, telefone)
  values (p_usuario_id, btrim(p_nome), btrim(coalesce(p_telefone, '')))
  on conflict (id) do update set nome = excluded.nome, telefone = excluded.telefone;

  -- Preserve address, nutritional goals and the customer's other profile fields.
  update public.perfis_clientes
  set nome_completo = btrim(p_nome), telefone = btrim(coalesce(p_telefone, ''))
  where id = p_usuario_id;

  insert into public.admin_usuario_roles (email, role, nome, telefone, observacoes, user_id, ativo, atualizado_em)
  select v_email, role, btrim(p_nome), nullif(btrim(p_telefone), ''),
    nullif(btrim(p_observacoes), ''), p_usuario_id, true, now()
  from (select distinct unnest(p_perfis) as role) selected
  where role <> 'student'
  on conflict (email, role) do update
  set nome = excluded.nome, telefone = excluded.telefone, observacoes = excluded.observacoes,
      user_id = excluded.user_id, ativo = true, atualizado_em = now();

  update public.admin_usuario_roles
  set ativo = false, atualizado_em = now()
  where lower(email) = v_email and role in ('admin', 'trainer', 'delivery')
    and not role = any(p_perfis);
end;
$$;

revoke all on function public.admin_salvar_perfis_usuario(uuid, uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.admin_salvar_perfis_usuario(uuid, uuid, text, text, text, text[]) to service_role;
