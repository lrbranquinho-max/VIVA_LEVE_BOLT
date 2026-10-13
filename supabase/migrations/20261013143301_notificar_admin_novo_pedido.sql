-- Ativa o disparo somente depois que a Edge Function compatível já estiver
-- implantada. pg_net envia a requisição após o commit.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.notificar_novo_pedido_admin()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  v_secret text;
begin
  if new.plano_id is not null or new.pedido_origem_id is not null then
    return new;
  end if;

  begin
    select decrypted_secret
      into v_secret
      from vault.decrypted_secrets
     where name = 'viva_leve_push_cron';

    if nullif(v_secret, '') is not null then
      perform net.http_post(
        url := 'https://kdhdtdwayqdbkxbbpawm.supabase.co/functions/v1/dispatch-notifications',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
        body := jsonb_build_object('tipo', 'novo_pedido', 'pedido_id', new.id),
        timeout_milliseconds := 5000
      );
    end if;
  exception when others then
    raise warning 'Falha ao enfileirar notificação do pedido %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function private.notificar_novo_pedido_admin() from public, anon, authenticated;

drop trigger if exists pedidos_notificar_admin_insert on public.pedidos;
create trigger pedidos_notificar_admin_insert
after insert on public.pedidos
for each row execute function private.notificar_novo_pedido_admin();
