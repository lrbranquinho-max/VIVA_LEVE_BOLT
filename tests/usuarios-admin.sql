-- Run as the database owner. Every profile change is rolled back.
begin;
do $$
declare
  v_admin uuid;
  v_usuario uuid;
  v_email text;
  v_perfil text;
  v_antes jsonb;
  v_depois jsonb;
  v_protegido boolean;
begin
  begin
  v_admin:=gen_random_uuid(); v_usuario:=gen_random_uuid(); v_email:=v_usuario::text||'@example.invalid';
  insert into auth.users(id,email) values(v_admin,v_admin::text||'@example.invalid'),(v_usuario,v_email);
  insert into public.admin_usuario_roles(email,role,nome,ativo,user_id)
  values(v_admin::text||'@example.invalid','admin','Admin QA',true,v_admin);
  insert into public.perfis_clientes(id,nome_completo,endereco_rua)
  values(v_usuario,'Aluno QA','Endereco preservado QA');

  select to_jsonb(c) - 'nome_completo' - 'telefone' into v_antes
  from public.perfis_clientes c where id = v_usuario;

  foreach v_perfil in array array['student','trainer','admin','delivery'] loop
    perform public.admin_salvar_perfis_usuario(v_admin, v_usuario, 'Cadastro QA', '61999990000', 'Teste revertido', array[v_perfil]);
    if not exists (select 1 from public.perfis where id = v_usuario and nome = 'Cadastro QA' and telefone = '61999990000') then
      raise exception 'FAIL cadastro do perfil %', v_perfil;
    end if;
    if v_perfil = 'student' then
      if exists (select 1 from public.admin_usuario_roles where lower(email) = v_email and ativo) then
        raise exception 'FAIL aluno recebeu permissao especial';
      end if;
    elsif not exists (select 1 from public.admin_usuario_roles where lower(email) = v_email and role = v_perfil and ativo and user_id = v_usuario) then
      raise exception 'FAIL permissao % nao vinculada ao auth.users', v_perfil;
    end if;
  end loop;

  perform public.admin_salvar_perfis_usuario(v_admin, v_usuario, 'Cadastro QA', '61999990000', '', array['admin','trainer','delivery']);
  if (select count(*) from public.admin_usuario_roles where lower(email) = v_email and ativo) <> 3 then
    raise exception 'FAIL perfis acumulaveis';
  end if;
  perform public.admin_salvar_perfis_usuario(v_admin, v_usuario, 'Cadastro QA', '61999990000', '', array['student']);

  v_protegido := false;
  begin
    perform public.admin_salvar_perfis_usuario(v_usuario, v_usuario, 'Acesso negado', '', '', array['admin']);
  exception when insufficient_privilege then v_protegido := true;
  end;
  if not v_protegido then raise exception 'FAIL usuario comum promoveu a si mesmo'; end if;

  v_protegido := false;
  begin
    perform public.admin_salvar_perfis_usuario(v_admin, v_admin, 'Acesso negado', '', '', array['student']);
  exception when insufficient_privilege then v_protegido := true;
  end;
  if not v_protegido then raise exception 'FAIL remocao do proprio admin'; end if;

  v_protegido := false;
  begin
    perform public.admin_salvar_perfis_usuario(v_admin, v_usuario, 'Invalido', '', '', array['superadmin']);
  exception when invalid_parameter_value then v_protegido := true;
  end;
  if not v_protegido then raise exception 'FAIL role invalida aceita'; end if;

  select to_jsonb(c) - 'nome_completo' - 'telefone' into v_depois
  from public.perfis_clientes c where id = v_usuario;
  if v_antes is distinct from v_depois then raise exception 'FAIL dados do cliente alterados fora do escopo'; end if;

  if has_function_privilege('anon', 'public.admin_salvar_perfis_usuario(uuid,uuid,text,text,text,text[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.admin_salvar_perfis_usuario(uuid,uuid,text,text,text,text[])', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.admin_salvar_perfis_usuario(uuid,uuid,text,text,text,text[])', 'EXECUTE') then
    raise exception 'FAIL privilegios da RPC';
  end if;
  raise exception using errcode='PZ001',message='QA_ROLLBACK';
  exception when sqlstate 'PZ001' then null;
  end;
end;
$$;
rollback;
select 'PASS: quatro perfis, multiplas roles, desativacao, protecao administrativa, dados preservados e RPC restrita. Alteracoes revertidas.' as resultado;
