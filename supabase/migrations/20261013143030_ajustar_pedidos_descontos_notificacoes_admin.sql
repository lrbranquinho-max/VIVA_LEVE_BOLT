-- Gestão de pedidos limitada a 30 dias no cliente, resumo financeiro completo,
-- remoção das promoções automáticas por valor e aviso imediato para administradores.

-- Remove chaves legadas, caso tenham sido cadastradas manualmente no JSON.
update public.app_config
   set valor = valor
     - 'frete_gratis_acima_de'
     - 'limite_frete_gratis'
     - 'desconto_automatico_percentual'
     - 'limite_desconto_automatico'
 where chave = 'loja_config';

-- A origem da verdade financeira fica no banco. Pedidos online avulsos sempre
-- recebem a taxa configurada; kits mantêm o frete calculado pela data escolhida.
-- Somente Dia D e cupom individual (incluindo boas-vindas) compõem o desconto.
create or replace function public.normalizar_financeiro_pedido_online()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_loja jsonb := '{}'::jsonb;
  v_desconto numeric := 0;
  v_cupom numeric;
begin
  if coalesce(new.tipo_venda, 'online') <> 'online'
     or new.plano_id is not null
     or new.pedido_origem_id is not null then
    return new;
  end if;

  select coalesce(valor, '{}'::jsonb)
    into v_loja
    from public.app_config
   where chave = 'loja_config';

  if new.checkout_idempotencia is null then
    new.valor_frete := greatest(0, coalesce((v_loja->>'taxa_entrega_padrao')::numeric, 10));
  end if;

  if coalesce((v_loja->>'cupom_dia_d_ativo')::boolean, false) then
    v_desconto := greatest(v_desconto, coalesce((v_loja->>'cupom_dia_d_percentual')::numeric, 0));
  end if;

  if new.cupom_id is not null then
    select percentual_desconto
      into v_cupom
      from public.cupons_desconto
     where id = new.cupom_id
       and cliente_id = new.cliente_id
       and status = 'aberto'
       and data_validade >= now();
    if not found then
      raise exception 'Cupom inválido ou expirado.' using errcode = '23514';
    end if;
    v_desconto := greatest(v_desconto, v_cupom);
  end if;

  v_desconto := least(100, greatest(0, v_desconto));
  new.desconto_percentual := v_desconto;
  new.desconto_valor := round(greatest(0, coalesce(new.subtotal_produtos, 0)) * v_desconto / 100, 2);
  new.valor_total := round(greatest(0, coalesce(new.subtotal_produtos, 0) - new.desconto_valor + coalesce(new.valor_frete, 0)), 2);
  new.total := new.valor_total;
  return new;
end;
$$;

revoke all on function public.normalizar_financeiro_pedido_online() from public, anon, authenticated;

drop trigger if exists pedidos_normalizar_financeiro_online on public.pedidos;
create trigger pedidos_normalizar_financeiro_online
before insert on public.pedidos
for each row execute function public.normalizar_financeiro_pedido_online();

alter table public.notification_inbox
  add column if not exists pedido_id bigint references public.pedidos(id) on delete set null,
  add column if not exists url text not null default '/';

alter table public.notification_deliveries
  add column if not exists pedido_id bigint references public.pedidos(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.notification_inbox'::regclass
       and conname = 'notification_inbox_pedido_usuario_key'
  ) then
    alter table public.notification_inbox
      add constraint notification_inbox_pedido_usuario_key unique (pedido_id, user_id);
  end if;
end;
$$;

