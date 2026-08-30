-- Evita conflito entre variaveis PL/pgSQL e aliases SQL ao validar o pedido.
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
  if new.plano_id is not null then
    if current_user in ('anon', 'authenticated') then
      raise exception 'Utilize o fluxo de planos para criar ou alterar entregas.';
    end if;
    return new;
  end if;

  if jsonb_typeof(new.itens) <> 'array' or jsonb_array_length(new.itens) = 0 then
    raise exception 'O pedido deve conter produtos.';
  end if;

  for v_item in
    select
      (item->>'id')::bigint as produto_id,
      sum((item->>'quantidade')::numeric) as quantidade
    from jsonb_array_elements(new.itens) as item
    group by 1
  loop
    if v_item.produto_id is null
       or v_item.quantidade is null
       or v_item.quantidade <= 0
       or trunc(v_item.quantidade) <> v_item.quantidade then
      raise exception 'Quantidade inválida.';
    end if;

    select produto.*
      into v_produto
      from public.produtos as produto
     where produto.id = v_item.produto_id;

    if not found or not v_produto.ativo then
      raise exception 'Produto indisponível.';
    end if;

    if v_produto.tipo_produto = 'kit' then
      if current_user in ('anon', 'authenticated') then
        raise exception 'Configure os sabores e conclua o plano pelo checkout.';
      end if;
    elsif v_produto.estoque < v_item.quantidade then
      raise exception 'Estoque insuficiente para %.', v_produto.nome;
    end if;
  end loop;

  select jsonb_agg(
           elemento || jsonb_build_object('tipo_produto', produto.tipo_produto)
         )
    into new.itens
    from jsonb_array_elements(new.itens) as elemento
    join public.produtos as produto
      on produto.id = (elemento->>'id')::bigint;

  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using
      errcode = '23514',
      message = 'O pedido possui identificador ou quantidade inválida.';
end;
$$;
