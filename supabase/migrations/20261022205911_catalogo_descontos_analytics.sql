-- Amplia o funil interno para medir exposição/clique de ofertas e enriquece Purchase.
-- Não altera regras de preço, cupons, checkout ou permissões.

alter table public.loja_eventos
  drop constraint if exists loja_eventos_event_name_check;

alter table public.loja_eventos
  add constraint loja_eventos_event_name_check check (event_name in (
    'store_visit', 'product_impression', 'product_click', 'product_view',
    'add_to_cart', 'checkout_started', 'payment_started', 'purchase',
    'whatsapp_click', 'instagram_click'
  ));

create or replace function private.registrar_purchase_analytics()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_consent boolean := false;
  v_valor numeric := round(coalesce(new.credito_valor_original, new.valor_total, new.total, 0), 2);
  v_original numeric := round(coalesce(new.subtotal_produtos, 0), 2);
  v_desconto_percentual numeric := round(coalesce(new.desconto_percentual, 0), 2);
  v_desconto_valor numeric := round(coalesce(new.desconto_valor, 0), 2);
  v_final_produtos numeric := greatest(round(coalesce(new.subtotal_produtos, 0) - coalesce(new.desconto_valor, 0), 2), 0);
  v_content_ids jsonb := '[]'::jsonb;
  v_content_names jsonb := '[]'::jsonb;
  v_num_items integer := 0;
begin
  if new.pedido_origem_id is not null
     or coalesce(new.tipo_venda, 'online') <> 'online'
     or coalesce(new.pagamento_status, '') <> 'approved'
     or (tg_op = 'UPDATE' and coalesce(old.pagamento_status, '') = 'approved') then
    return new;
  end if;

  if new.analytics_sessao_id is not null then
    select coalesce(meta_consent, false)
      into v_consent
      from public.loja_acessos
     where sessao_id = new.analytics_sessao_id;
  end if;

  if jsonb_typeof(new.itens) = 'array' then
    select
      coalesce(jsonb_agg(distinct item->>'id') filter (where nullif(item->>'id', '') is not null), '[]'::jsonb),
      coalesce(jsonb_agg(distinct item->>'nome') filter (where nullif(item->>'nome', '') is not null), '[]'::jsonb),
      coalesce(sum(greatest(coalesce(nullif(item->>'quantidade', '')::integer, 1), 1)), 0)::integer
      into v_content_ids, v_content_names, v_num_items
      from jsonb_array_elements(new.itens) item;
  end if;

  insert into public.loja_eventos (
    event_name, sessao_id, user_id, pedido_id, pagina, origem, propriedades, ocorrido_em
  ) values (
    'purchase', new.analytics_sessao_id, new.cliente_id, new.id,
    '/pagamento/sucesso', 'server',
    jsonb_build_object(
      'value', v_valor,
      'currency', 'BRL',
      'content_ids', v_content_ids,
      'content_name', v_content_names,
      'content_type', 'product',
      'num_items', v_num_items,
      'payment_method', new.meio_pagamento,
      'original_price', v_original,
      'discount_percent', v_desconto_percentual,
      'final_price', v_final_produtos,
      'discount_campaign', case
        when new.cupom_id is not null and v_desconto_percentual > 0 then 'user_coupon'
        when v_desconto_percentual > 0 then 'dia_d'
        else 'none'
      end,
      'discount_coupon_id', new.cupom_id,
      'has_discount', v_desconto_valor > 0,
      'meta_consent', v_consent
    ),
    coalesce(new.pago_em, now())
  ) on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.registrar_purchase_analytics() from public, anon, authenticated;
