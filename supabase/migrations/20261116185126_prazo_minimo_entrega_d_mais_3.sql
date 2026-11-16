-- Prazo temporário para novos pedidos: nenhuma entrega pode nascer antes de
-- D+3, considerando a data civil de Brasília. Pedidos e entregas existentes
-- não são alterados por esta migration.
create schema if not exists private;

create or replace function private.aplicar_prazo_minimo_novo_pedido()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_data_minima date := (now() at time zone 'America/Sao_Paulo')::date + 3;
  v_contem_kit boolean := false;
begin
  if new.plano_id is not null then
    if new.entrega_prevista is null or new.entrega_prevista < v_data_minima then
      raise exception 'A data mínima de entrega é %.', to_char(v_data_minima, 'DD/MM/YYYY')
        using errcode = '22007';
    end if;
    return new;
  end if;

  if new.pedido_origem_id is null then
    if jsonb_typeof(coalesce(new.itens, '[]'::jsonb)) = 'array' then
      select exists (
        select 1
        from jsonb_array_elements(coalesce(new.itens, '[]'::jsonb)) as item
        where item->>'tipo_produto' = 'kit'
      ) into v_contem_kit;
    end if;

    -- Pedidos avulsos não possuem agenda derivada de um plano; a previsão
    -- nasce no próprio pedido e nunca é antecipada caso o chamador informe
    -- uma data posterior.
    if not v_contem_kit then
      new.entrega_prevista := greatest(coalesce(new.entrega_prevista, v_data_minima), v_data_minima);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists a05_aplicar_prazo_minimo_novo_pedido on public.pedidos;
create trigger a05_aplicar_prazo_minimo_novo_pedido
before insert on public.pedidos
for each row execute function private.aplicar_prazo_minimo_novo_pedido();
