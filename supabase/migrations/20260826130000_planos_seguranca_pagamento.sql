create function public.preparar_pagamento_plano(p_pedido_id bigint,p_meio text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.pedidos%rowtype; meio text;
begin
  select * into p from public.pedidos where id=p_pedido_id for update;
  if not found or p.plano_id is not null then raise exception 'Pague o pedido principal.'; end if;
  if p.checkout_idempotencia is null then return; end if;
  meio:=case when p_meio like 'cielo_%' then 'cielo' else p_meio end;
  if meio not in ('pix','mercado_pago','cielo') or meio is null then raise exception 'Meio inválido.'; end if;
  if p.pagamento_status='approved' or p.status='Cancelado' or exists(select 1 from public.planos_marmitas where pedido_id=p.id and status='Cancelado') then raise exception 'Plano pago ou cancelado.'; end if;
  if not coalesce((select (valor->'meios_pagamento'->>meio)::boolean from public.app_config where chave='loja_config'),true) then raise exception 'Meio desativado.'; end if;
  update public.pedidos set meio_pagamento=p_meio where id=p.id;
end $$;
revoke all on function public.preparar_pagamento_plano(bigint,text) from public,anon,authenticated;
grant execute on function public.preparar_pagamento_plano(bigint,text) to service_role;

create function public.validar_config_planos() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.chave<>'planos_config' then return new; end if;
  if jsonb_typeof(new.valor->'dias') is distinct from 'array' or jsonb_typeof(new.valor->'bandeiras') is distinct from 'object'
     or jsonb_typeof(new.valor->'antecedencia_dias') is distinct from 'number' then raise exception 'Configuração de planos inválida.'; end if;
  if (new.valor->>'antecedencia_dias')::int not between 1 and 90 then raise exception 'Antecedência deve ser de 1 a 90 dias.'; end if;
  if exists(select 1 from jsonb_array_elements(new.valor->'dias') d where d::text !~ '^[1-6]$') then raise exception 'Dias permitidos: segunda a sábado.'; end if;
  if exists(select 1 from jsonb_each(new.valor->'bandeiras') b where b.key not in ('Alelo','VR','Ticket','Pluxee') or jsonb_typeof(b.value)<>'boolean') then raise exception 'Bandeiras inválidas.'; end if;
  return new;
end $$;
create trigger validar_config_planos before insert or update on public.app_config for each row execute function public.validar_config_planos();
revoke all on function public.validar_config_planos() from public,anon,authenticated;

