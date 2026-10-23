-- Dispara a CAPI depois do commit, sem bloquear a confirmação do pagamento.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.despachar_purchase_meta()
returns trigger language plpgsql security definer
set search_path = public, vault, net, pg_temp
as $$
declare v_secret text;
begin
  if new.event_name not in ('store_visit','product_view','add_to_cart','checkout_started','purchase')
     or coalesce(new.propriedades->'meta_consent','false'::jsonb) <> 'true'::jsonb then
    return new;
  end if;
  insert into public.meta_capi_entregas(event_id,status) values(new.event_id,'pending') on conflict(event_id) do nothing;
  -- Eventos do navegador são enviados imediatamente pela API, com user-agent/IP
  -- somente em trânsito. A fila acima garante retry. Purchase nasce no banco.
  if new.event_name <> 'purchase' then return new; end if;
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name='viva_leve_push_cron';
    if nullif(v_secret,'') is not null then
      perform net.http_post(
        url := 'https://kdhdtdwayqdbkxbbpawm.supabase.co/functions/v1/meta-conversions',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',v_secret),
        body := jsonb_build_object('event_id',new.event_id), timeout_milliseconds := 8000
      );
    end if;
  exception when others then
    raise warning 'Falha ao despachar CAPI para evento %: %',new.event_id,sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function private.despachar_purchase_meta() from public,anon,authenticated;
drop trigger if exists loja_eventos_despachar_purchase_meta on public.loja_eventos;
create trigger loja_eventos_despachar_purchase_meta after insert on public.loja_eventos
for each row execute function private.despachar_purchase_meta();

do $$ begin perform cron.unschedule('viva-leve-meta-capi-outbox'); exception when others then null; end $$;
select cron.schedule('viva-leve-meta-capi-outbox','*/5 * * * *',$cron$
  select net.http_post(
    url:='https://kdhdtdwayqdbkxbbpawm.supabase.co/functions/v1/meta-conversions',
    body:='{"drain":true}'::jsonb,
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='viva_leve_push_cron')),
    timeout_milliseconds:=30000
  );
$cron$);
