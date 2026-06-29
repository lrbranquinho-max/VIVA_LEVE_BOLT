/*
  Venda balcão no módulo administrativo.

  Permite registrar pedidos administrativos sem cliente autenticado,
  com cliente/endereço opcionais, frete opcional e desconto opcional.
*/

alter table public.pedidos
  alter column cliente_id drop not null,
  alter column endereco_entrega drop not null,
  alter column endereco drop not null;

alter table public.pedidos
  add column if not exists tipo_venda text not null default 'online',
  add column if not exists cliente_nome_balcao text,
  add column if not exists cliente_telefone_balcao text,
  add column if not exists observacoes_balcao text;

update public.pedidos
set tipo_venda = 'online'
where tipo_venda is null or tipo_venda = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pedidos_tipo_venda_check'
      and conrelid = 'public.pedidos'::regclass
  ) then
    alter table public.pedidos
      add constraint pedidos_tipo_venda_check
      check (tipo_venda in ('online', 'balcao'));
  end if;
end $$;

drop policy if exists "Admins can insert pedidos" on public.pedidos;

create policy "Admins can insert pedidos"
  on public.pedidos for insert to authenticated
  with check (is_viva_leve_admin());
