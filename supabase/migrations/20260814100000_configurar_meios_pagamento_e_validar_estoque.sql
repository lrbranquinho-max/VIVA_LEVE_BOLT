insert into public.app_config (chave, valor)
values (
  'loja_config',
  '{"meios_pagamento":{"cielo":true,"mercado_pago":true,"pix":true}}'::jsonb
)
on conflict (chave) do update
set valor = jsonb_set(
  public.app_config.valor,
  '{meios_pagamento}',
  '{"cielo":true,"mercado_pago":true,"pix":true}'::jsonb || coalesce(public.app_config.valor->'meios_pagamento', '{}'::jsonb),
  true
);

create or replace function public.validar_estoque_itens_pedido()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_produto record;
begin
  if jsonb_typeof(coalesce(new.itens::jsonb, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(new.itens::jsonb, '[]'::jsonb)) = 0 then
    raise exception using errcode = '23514', message = 'O pedido deve conter ao menos um produto.';
  end if;

  for v_item in
    select
      (item->>'id')::bigint as produto_id,
      sum((item->>'quantidade')::numeric) as quantidade
    from jsonb_array_elements(new.itens::jsonb) item
    group by (item->>'id')::bigint
  loop
    if v_item.produto_id is null or v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception using errcode = '23514', message = 'O pedido possui item ou quantidade invalida.';
    end if;

    select id, nome, ativo, estoque
      into v_produto
      from public.produtos
     where id = v_item.produto_id;

    if not found or not coalesce(v_produto.ativo, false) then
      raise exception using errcode = '23514', message = 'Um produto do pedido nao esta disponivel para venda.';
    end if;

    if coalesce(v_produto.estoque, 0) < v_item.quantidade then
      raise exception using
        errcode = '23514',
        message = format('Estoque insuficiente para %s. Disponivel: %s.', v_produto.nome, coalesce(v_produto.estoque, 0));
    end if;
  end loop;

  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '23514', message = 'O pedido possui identificador ou quantidade invalida.';
end;
$$;

drop trigger if exists validar_estoque_itens_pedido_trigger on public.pedidos;
create trigger validar_estoque_itens_pedido_trigger
before insert or update of itens on public.pedidos
for each row execute function public.validar_estoque_itens_pedido();
