-- Keep the checkout address linked to the customer's structured profile.
alter table public.perfis_clientes
  add column if not exists endereco_uf text;

alter table public.perfis_clientes
  drop constraint if exists perfis_clientes_endereco_uf_check;
alter table public.perfis_clientes
  add constraint perfis_clientes_endereco_uf_check
  check (endereco_uf is null or endereco_uf ~ '^[A-Z]{2}$');

update public.perfis_clientes perfil
   set endereco_uf = regiao.uf
  from public.regioes_atendimento regiao
 where regiao.status = 'ativa'
   and public.normalizar_regiao_atendimento(perfil.regiao_df)
       = public.normalizar_regiao_atendimento(regiao.regiao)
   and perfil.endereco_uf is distinct from regiao.uf;

create or replace function public.canonicalizar_regiao_perfil()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_regiao record;
begin
  new.regiao_df := nullif(btrim(new.regiao_df), '');
  new.endereco_uf := upper(nullif(btrim(new.endereco_uf), ''));
  if new.regiao_df is null then return new; end if;

  select regiao, uf
    into v_regiao
    from public.regioes_atendimento
   where status = 'ativa'
     and public.normalizar_regiao_atendimento(regiao)
         = public.normalizar_regiao_atendimento(new.regiao_df)
     and (new.endereco_uf is null or uf = new.endereco_uf)
   order by regiao
   limit 1;

  if found then
    new.regiao_df := v_regiao.regiao;
    new.endereco_uf := v_regiao.uf;
  else
    raise exception 'Selecione uma região e UF ativas para entrega.';
  end if;
  return new;
end;
$$;

drop trigger if exists canonicalizar_regiao_perfil_trigger on public.perfis_clientes;
create trigger canonicalizar_regiao_perfil_trigger
before insert or update of regiao_df, endereco_uf on public.perfis_clientes
for each row execute function public.canonicalizar_regiao_perfil();

create or replace function public.completar_uf_endereco_pedido()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uf text;
begin
  if new.cliente_id is null or nullif(btrim(new.endereco_entrega), '') is null then
    return new;
  end if;

  select endereco_uf into v_uf
    from public.perfis_clientes
   where id = new.cliente_id;

  if v_uf is not null
     and btrim(new.endereco_entrega) !~* ('(^|[, -])' || v_uf || '$') then
    new.endereco_entrega := btrim(new.endereco_entrega) || ', ' || v_uf;
  end if;
  return new;
end;
$$;

drop trigger if exists az_completar_uf_endereco_pedido on public.pedidos;
create trigger az_completar_uf_endereco_pedido
before insert or update of endereco_entrega on public.pedidos
for each row execute function public.completar_uf_endereco_pedido();

comment on column public.perfis_clientes.endereco_uf is
  'UF do endereço de entrega, validada pela região de atendimento selecionada.';
