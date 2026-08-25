-- Complemento de auditoria e indices do fluxo de entregas.

create index if not exists entregas_historico_entregador_anterior_idx
  on public.entregas_historico (entregador_anterior_id)
  where entregador_anterior_id is not null;

create index if not exists entregas_historico_ator_idx
  on public.entregas_historico (ator_id)
  where ator_id is not null;

create index if not exists pedidos_entrega_confirmada_por_idx
  on public.pedidos (entrega_confirmada_por)
  where entrega_confirmada_por is not null;

create or replace function public.auditar_pedido_entrega()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_evento text;
  v_ator_tipo text;
begin
  if old.entregador_id is distinct from new.entregador_id then
    v_evento := case
      when old.entregador_id is null and new.entregador_id is not null then 'atribuido'
      when old.entregador_id is not null and new.entregador_id is null then 'atribuicao_removida'
      else 'reatribuido'
    end;
    insert into public.entregas_historico (
      pedido_id, evento, status_anterior, status_novo, entregador_anterior_id,
      entregador_novo_id, ator_id, ator_tipo
    ) values (
      new.id, v_evento, old.status, new.status, old.entregador_id,
      new.entregador_id, auth.uid(), public.entrega_ator_tipo()
    );
  end if;

  if old.status is distinct from new.status
     and (old.status = 'Saiu para Entrega' or new.status in ('Saiu para Entrega', 'Entregue')) then
    v_evento := case
      when new.status = 'Saiu para Entrega' then 'saiu_para_entrega'
      when new.status = 'Entregue' then 'entregue'
      else 'status_alterado'
    end;
    v_ator_tipo := case
      when new.status = 'Entregue' and new.entrega_metodo_confirmacao = 'cliente' then 'client'
      when new.status = 'Entregue' and new.entrega_metodo_confirmacao = 'codigo_entregador' then 'delivery'
      else public.entrega_ator_tipo()
    end;
    insert into public.entregas_historico (
      pedido_id, evento, status_anterior, status_novo, entregador_anterior_id,
      entregador_novo_id, ator_id, ator_tipo, metodo_confirmacao
    ) values (
      new.id, v_evento, old.status, new.status, old.entregador_id,
      new.entregador_id, auth.uid(), v_ator_tipo, new.entrega_metodo_confirmacao
    );
  end if;
  return new;
end;
$$;

revoke all on function public.auditar_pedido_entrega() from public, anon, authenticated;
