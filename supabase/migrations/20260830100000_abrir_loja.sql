update public.app_config
set valor = jsonb_set(
  coalesce(valor, '{}'::jsonb),
  '{data_liberacao_vendas}',
  to_jsonb('2020-01-01T00:00:00-03:00'::text),
  true
)
where chave = 'loja_config';

create or replace function public.validar_estoque_itens_pedido()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  i record;
  p record;
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

  for i in
    select (item->>'id')::bigint id, sum((item->>'quantidade')::numeric) qtd
    from jsonb_array_elements(new.itens) item
    group by 1
  loop
    if i.id is null or i.qtd is null or i.qtd <= 0 or trunc(i.qtd) <> i.qtd then
      raise exception 'Quantidade inválida.';
    end if;

    select * into p from public.produtos where id = i.id;
    if not found or not p.ativo then raise exception 'Produto indisponível.'; end if;

    if p.tipo_produto = 'kit' then
      if current_user in ('anon', 'authenticated') then
        raise exception 'Configure os sabores e conclua o plano pelo checkout.';
      end if;
    elsif p.estoque < i.qtd then
      raise exception 'Estoque insuficiente para %.', p.nome;
    end if;
  end loop;

  select jsonb_agg(e || jsonb_build_object('tipo_produto', p.tipo_produto))
  into new.itens
  from jsonb_array_elements(new.itens) e
  join public.produtos p on p.id = (e->>'id')::bigint;

  return new;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '23514', message = 'O pedido possui identificador ou quantidade inválida.';
end;
$$;
