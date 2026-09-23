-- Frete por tipo/data, reagendamento e cancelamento administrativo de kits,
-- além da infraestrutura auditável de notificações in-app e Web Push.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions(user_id) where ativo;

alter table public.push_subscriptions enable row level security;
drop policy if exists "Usuarios gerenciam proprias inscricoes push" on public.push_subscriptions;
create policy "Usuarios gerenciam proprias inscricoes push"
  on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select,insert,update,delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

create or replace function public.salvar_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default null)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Faça login para ativar notificações.' using errcode='42501'; end if;
  if nullif(btrim(p_endpoint),'') is null or nullif(btrim(p_p256dh),'') is null or nullif(btrim(p_auth),'') is null then raise exception 'Inscrição Push inválida.' using errcode='22023'; end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,user_agent,ativo,atualizado_em)
  values(auth.uid(),p_endpoint,p_p256dh,p_auth,left(p_user_agent,500),true,now())
  on conflict(endpoint) do update set user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,ativo=true,atualizado_em=now();
end;
$$;
revoke all on function public.salvar_push_subscription(text,text,text,text) from public,anon;
grant execute on function public.salvar_push_subscription(text,text,text,text) to authenticated;

create table if not exists public.notification_schedules (
  id uuid primary key default gen_random_uuid(),
  titulo text not null default 'Viva Leve' check (char_length(titulo) between 1 and 80),
  mensagem text not null check (char_length(mensagem) between 3 and 500),
  tipo text not null check (tipo in ('semanal','unica')),
  dia_semana smallint check (dia_semana between 0 and 6),
  hora time,
  agendada_para timestamptz,
  ativa boolean not null default true,
  ultima_execucao_em timestamptz,
  criado_por uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint notification_schedule_campos_check check (
    (tipo='semanal' and dia_semana is not null and hora is not null and agendada_para is null)
    or (tipo='unica' and agendada_para is not null and dia_semana is null and hora is null)
  )
);

create index if not exists notification_schedules_due_idx
  on public.notification_schedules(ativa,tipo,agendada_para,dia_semana,hora);

alter table public.notification_schedules enable row level security;
drop policy if exists "Admins gerenciam notificacoes" on public.notification_schedules;
create policy "Admins gerenciam notificacoes"
  on public.notification_schedules for all to authenticated
  using (public.is_viva_leve_admin())
  with check (public.is_viva_leve_admin());
grant select,insert,update,delete on public.notification_schedules to authenticated;
grant all on public.notification_schedules to service_role;

create table if not exists public.notification_inbox (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.notification_schedules(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null,
  mensagem text not null,
  referencia_data date not null,
  lida_em timestamptz,
  criada_em timestamptz not null default now(),
  unique(schedule_id,user_id,referencia_data)
);

create index if not exists notification_inbox_user_unread_idx
  on public.notification_inbox(user_id,criada_em desc) where lida_em is null;

alter table public.notification_inbox enable row level security;
drop policy if exists "Usuarios leem proprias notificacoes" on public.notification_inbox;
create policy "Usuarios leem proprias notificacoes"
  on public.notification_inbox for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Usuarios marcam proprias notificacoes" on public.notification_inbox;
create policy "Usuarios marcam proprias notificacoes"
  on public.notification_inbox for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select,update on public.notification_inbox to authenticated;
grant all on public.notification_inbox to service_role;

do $$
begin
  alter publication supabase_realtime add table public.notification_inbox;
exception when duplicate_object then null;
end $$;

create table if not exists public.notification_deliveries (
  id bigint generated always as identity primary key,
  schedule_id uuid references public.notification_schedules(id) on delete set null,
  executada_em timestamptz not null default now(),
  usuarios_inbox integer not null default 0,
  push_enviados integer not null default 0,
  push_falhos integer not null default 0,
  detalhes jsonb not null default '{}'::jsonb
);
alter table public.notification_deliveries enable row level security;
drop policy if exists "Admins leem entregas de notificacoes" on public.notification_deliveries;
create policy "Admins leem entregas de notificacoes"
  on public.notification_deliveries for select to authenticated
  using (public.is_viva_leve_admin());
grant select on public.notification_deliveries to authenticated;
grant all on public.notification_deliveries to service_role;

create or replace function public.touch_notification_schedule()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin new.atualizado_em:=now(); return new; end;
$$;
drop trigger if exists notification_schedule_touch on public.notification_schedules;
create trigger notification_schedule_touch before update on public.notification_schedules
for each row execute function public.touch_notification_schedule();

create or replace function public.claim_due_notification_schedules()
returns table(id uuid,titulo text,mensagem text,referencia_data date)
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_agora_local timestamp := timezone('America/Sao_Paulo',now());
begin
  return query
  with devidas as (
    select n.id
      from public.notification_schedules n
     where n.ativa
       and ((n.tipo='unica' and n.agendada_para<=now() and n.ultima_execucao_em is null)
         or (n.tipo='semanal'
             and n.dia_semana=extract(dow from v_agora_local)::int
             and n.hora<=v_agora_local::time
             and (n.ultima_execucao_em is null or timezone('America/Sao_Paulo',n.ultima_execucao_em)::date<v_agora_local::date)))
     for update skip locked
  ), atualizadas as (
    update public.notification_schedules n
       set ultima_execucao_em=now(),
           ativa=case when n.tipo='unica' then false else n.ativa end
      from devidas d where n.id=d.id
      returning n.id,n.titulo,n.mensagem
  )
  select a.id,a.titulo,a.mensagem,v_agora_local::date from atualizadas a;
end;
$$;

create or replace function public.bootstrap_push_secrets(p_public text,p_private text,p_cron text)
returns void language plpgsql security definer set search_path=public,vault,pg_temp
as $$
begin
  if not exists(select 1 from vault.secrets where name='viva_leve_vapid_public') then
    perform vault.create_secret(p_public,'viva_leve_vapid_public','Chave pública VAPID das notificações Viva Leve',null);
  end if;
  if not exists(select 1 from vault.secrets where name='viva_leve_vapid_private') then
    perform vault.create_secret(p_private,'viva_leve_vapid_private','Chave privada VAPID das notificações Viva Leve',null);
  end if;
  if not exists(select 1 from vault.secrets where name='viva_leve_push_cron') then
    perform vault.create_secret(p_cron,'viva_leve_push_cron','Autenticação interna do disparador de notificações',null);
  end if;
end;
$$;

create or replace function public.get_push_secrets()
returns table(vapid_public text,vapid_private text,cron_secret text)
language sql security definer set search_path=public,vault,pg_temp
as $$
  select max(decrypted_secret) filter(where name='viva_leve_vapid_public'),
         max(decrypted_secret) filter(where name='viva_leve_vapid_private'),
         max(decrypted_secret) filter(where name='viva_leve_push_cron')
    from vault.decrypted_secrets
   where name in ('viva_leve_vapid_public','viva_leve_vapid_private','viva_leve_push_cron');
$$;

revoke all on function public.touch_notification_schedule(),public.claim_due_notification_schedules(),
  public.bootstrap_push_secrets(text,text,text),public.get_push_secrets() from public,anon,authenticated;
grant execute on function public.claim_due_notification_schedules(),
  public.bootstrap_push_secrets(text,text,text),public.get_push_secrets() to service_role;

create or replace function public.reagendar_entrega_admin(p_pedido_id bigint,p_data date,p_observacao text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v public.pedidos%rowtype; v_obs text:=nullif(btrim(p_observacao),'');
begin
  if auth.uid() is null or not public.is_viva_leve_admin() then raise exception 'Acesso restrito a administradores.' using errcode='42501'; end if;
  select * into v from public.pedidos where id=p_pedido_id for update;
  if not found or v.somente_planos then raise exception 'Entrega não encontrada.' using errcode='P0002'; end if;
  if v.status in ('Entregue','Cancelado') then raise exception 'Entrega encerrada não pode ser reagendada.' using errcode='23514'; end if;
  if v.status='Saiu para Entrega' then raise exception 'Retire a entrega da rota antes de reagendar.' using errcode='23514'; end if;
  if p_data is null or p_data<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Escolha uma data válida.' using errcode='22023'; end if;
  update public.pedidos set entrega_prevista=p_data,
    entrega_observacoes=case when v_obs is null then entrega_observacoes else concat_ws(E'\n',nullif(btrim(entrega_observacoes),''),'Reagendamento: '||v_obs) end,
    updated_at=now() where id=v.id;
  insert into public.entregas_historico(pedido_id,evento,status_anterior,status_novo,entregador_anterior_id,entregador_novo_id,ator_id,ator_tipo,detalhes)
  values(v.id,'status_alterado',v.status,v.status,v.entregador_id,v.entregador_id,auth.uid(),'admin',jsonb_build_object('acao_admin','reagendar','data_anterior',v.entrega_prevista,'nova_data',p_data,'observacao',v_obs));
  if v.plano_id is not null then
    insert into public.planos_marmitas_historico(plano_id,pedido_entrega_id,evento,detalhes,ator_id)
    values(v.plano_id,v.id,'reprogramar',jsonb_build_object('data_anterior',v.entrega_prevista,'nova_data',p_data,'motivo',v_obs),auth.uid());
  end if;
  return jsonb_build_object('ok',true,'pedido_id',v.id,'nova_data',p_data);
end;
$$;
revoke all on function public.reagendar_entrega_admin(bigint,date,text) from public,anon;
grant execute on function public.reagendar_entrega_admin(bigint,date,text) to authenticated;

create or replace function public.cancelar_pedido_nao_pago_admin(p_pedido_id bigint,p_motivo text,p_gateway_result jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v public.pedidos%rowtype; v_admin uuid:=auth.uid(); v_motivo text:=nullif(btrim(p_motivo),'');
begin
  if v_admin is null or not public.is_viva_leve_admin() then raise exception 'Apenas administradores podem cancelar pedidos.' using errcode='42501'; end if;
  if v_motivo is null or char_length(v_motivo) not between 3 and 500 then raise exception 'Informe um motivo entre 3 e 500 caracteres.' using errcode='22023'; end if;
  select * into v from public.pedidos where id=p_pedido_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode='P0002'; end if;
  if v.plano_id is not null or v.pedido_origem_id is not null then raise exception 'Cancele o pedido principal, não uma entrega do kit.' using errcode='22023'; end if;
  if v.cancelado_admin_em is not null or lower(btrim(coalesce(v.status,'')))='cancelado' then return jsonb_build_object('ok',true,'already_cancelled',true,'pedido_id',v.id); end if;
  if v.pago_em is not null or lower(btrim(coalesce(v.pagamento_status,''))) in ('approved','paid','pago','balcao') then raise exception 'Pedido pago não pode ser cancelado por esta ação.' using errcode='23514'; end if;
  if not (lower(btrim(coalesce(v.status,''))) in ('pendente','aguardando pagamento','pagamento recusado')
      or (v.checkout_idempotencia is not null and v.meio_pagamento='voucher_presencial')) then
    raise exception 'Somente pedidos sem pagamento confirmado podem ser cancelados.' using errcode='23514';
  end if;
  if v.credito_status='reservado' then perform public.liberar_credito_pedido(v.id::text,null); end if;
  update public.pedidos set status='Cancelado',pagamento_status=case when pagamento_status is null then null else 'cancelled' end,
    cancelado_admin_em=now(),cancelado_admin_por=v_admin,cancelamento_admin_motivo=v_motivo,
    cancelamento_gateway=coalesce(p_gateway_result,'{}'::jsonb),entregador_id=null,entrega_atribuida_em=null,updated_at=now()
  where id=v.id;
  return jsonb_build_object('ok',true,'already_cancelled',false,'pedido_id',v.id);
end;
$$;
revoke all on function public.cancelar_pedido_nao_pago_admin(bigint,text,jsonb) from public,anon;
grant execute on function public.cancelar_pedido_nao_pago_admin(bigint,text,jsonb) to authenticated;

do $$ begin
  perform cron.unschedule('viva-leve-dispatch-notifications');
exception when others then null; end $$;
select cron.schedule('viva-leve-dispatch-notifications','* * * * *',$cron$
  select net.http_post(
    url:='https://kdhdtdwayqdbkxbbpawm.supabase.co/functions/v1/dispatch-notifications',
    body:='{}'::jsonb,
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='viva_leve_push_cron')),
    timeout_milliseconds:=30000
  );
$cron$);

-- Checkout autoritativo: frete em toda venda avulsa, frete zero somente para
-- sacola composta exclusivamente por kits com primeira entrega no sábado.
-- Cartão Alimentação permanece disponível em sacolas mistas que contenham kit.
create or replace function public.criar_pedido_com_planos(p_itens jsonb,p_metodo text,p_bandeira text,p_cupom_id uuid,p_idempotencia uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  uid uuid:=auth.uid(); cfg jsonb; loja jsonb; cli public.perfis_clientes%rowtype; pf public.perfis%rowtype;
  p public.produtos%rowtype; sabor public.produtos%rowtype; item jsonb; s jsonb; itens jsonb:='[]'; sabores jsonb; kits jsonb:='[]'; config_escolhida jsonb;
  restante jsonb; entrega_itens jsonb; k jsonb; pedido bigint; plano uuid; filho bigint;
  qtd int; n int; total_sabores int; unidades int; pos int; por_entrega int; entregas_escolhidas int; total_kit int; quota int; faltam int; data_inicial date;
  subtotal numeric(12,2):=0; frete numeric(12,2); desconto numeric:=0; valor numeric(12,2); cupom numeric;
  apenas boolean:=true; voucher_elegivel boolean:=false; kits_sabado boolean:=true; anterior public.pedidos%rowtype;
begin
  if uid is null then raise exception 'Faça login para comprar.' using errcode='42501'; end if;
  if p_idempotencia is null then raise exception 'Identificador da compra ausente.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||p_idempotencia::text,0));
  select * into anterior from public.pedidos where cliente_id=uid and checkout_idempotencia=p_idempotencia;
  if found then return jsonb_build_object('id',anterior.id,'valor_total',anterior.valor_total,'itens',anterior.itens); end if;
  select c.valor into cfg from public.app_config c where chave='planos_config';
  select c.valor into loja from public.app_config c where chave='loja_config';
  if cfg is null then raise exception 'Configuração dos planos indisponível.'; end if;
  if p_metodo not in ('pix','mercado_pago','cielo','voucher_presencial','credito') or p_metodo is null then raise exception 'Forma de pagamento inválida.'; end if;
  if p_metodo in ('pix','mercado_pago','cielo') and not coalesce((loja->'meios_pagamento'->>p_metodo)::boolean,true) then raise exception 'Meio de pagamento desativado.'; end if;
  if p_metodo='voucher_presencial' and not coalesce((cfg->'bandeiras'->>p_bandeira)::boolean,false) then raise exception 'Bandeira de Cartão Alimentação indisponível.'; end if;
  select * into cli from public.perfis_clientes where id=uid; select * into pf from public.perfis where id=uid;
  if nullif(trim(coalesce(cli.nome_completo,pf.nome,'')),'') is null or length(regexp_replace(coalesce(cli.telefone,pf.telefone,''),'[^0-9]','','g'))<10
    or nullif(trim(cli.endereco_rua),'') is null or nullif(trim(cli.endereco_numero),'') is null or nullif(trim(cli.bairro),'') is null or nullif(trim(cli.regiao_df),'') is null then raise exception 'Complete nome, telefone e endereço no perfil.'; end if;
  if not exists(select 1 from public.regioes_atendimento where public.normalizar_regiao_atendimento(regiao)=public.normalizar_regiao_atendimento(cli.regiao_df) and status='ativa') then raise exception 'Região não atendida.'; end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 50 then raise exception 'Carrinho inválido.'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_itens))<>jsonb_array_length(p_itens) then raise exception 'Produtos duplicados no carrinho.'; end if;
  for item in select value from jsonb_array_elements(p_itens) loop
    select * into p from public.produtos where id=(item->>'id')::bigint for share; qtd:=(item->>'quantidade')::int;
    if not found or not p.ativo or p.preco<=0 or qtd is null or qtd not between 1 and 20 then raise exception 'Produto ou quantidade inválida.'; end if;
    if p.tipo_produto='kit' then
      sabores:='[]'; total_sabores:=0; unidades:=0; total_kit:=(p.plano_config->>'total_marmitas')::int;
      entregas_escolhidas:=coalesce((item->'plano'->>'entregas')::int,case when total_kit in (14,24) then 1 else (p.plano_config->>'entregas')::int end);
      if entregas_escolhidas is null or entregas_escolhidas <= 0 then
        raise exception 'Quantidade de entregas inválida para este kit.';
      end if;
      if not ((total_kit=14 and entregas_escolhidas in (1,2)) or (total_kit=24 and entregas_escolhidas in (1,2,4))
        or (total_kit not in (14,24) and entregas_escolhidas=(p.plano_config->>'entregas')::int))
        or total_kit%entregas_escolhidas<>0 then raise exception 'Quantidade de entregas inválida para este kit.'; end if;
      config_escolhida:=p.plano_config||jsonb_build_object('entregas',entregas_escolhidas,'marmitas_por_entrega',total_kit/entregas_escolhidas);
      if jsonb_typeof(item->'plano'->'sabores')<>'array' or item->'plano'->'sabores' is null then raise exception 'Escolha os sabores do plano.'; end if;
      for s in select value from jsonb_array_elements(item->'plano'->'sabores') loop
        select * into sabor from public.produtos where id=(s->>'id')::bigint for share; n:=(s->>'quantidade')::int;
        if not found or not sabor.ativo or not sabor.disponivel_kit or sabor.tipo_produto<>'avulso' or sabor.categoria::text<>'Marmitas' or n is null or n<1 then raise exception 'Sabor ou quantidade não elegível para kits.'; end if;
        if sabores @> jsonb_build_array(jsonb_build_object('id',sabor.id)) then raise exception 'Sabor repetido.'; end if;
        sabores:=sabores||jsonb_build_array(jsonb_build_object('id',sabor.id,'nome',sabor.nome,'quantidade',n)); total_sabores:=total_sabores+1; unidades:=unidades+n;
      end loop;
      if total_sabores not between (p.plano_config->>'sabores_min')::int and (p.plano_config->>'sabores_max')::int or unidades<>total_kit then raise exception 'Confira o total de marmitas e a quantidade de sabores do plano.'; end if;
      data_inicial:=(item->'plano'->>'primeira_data')::date;
      if data_inicial is null or data_inicial<(now() at time zone 'America/Sao_Paulo')::date+greatest(1,(cfg->>'antecedencia_dias')::int)
        or extract(dow from data_inicial)=0 or not cfg->'dias' @> jsonb_build_array(extract(dow from data_inicial)::int) or data_inicial>(now() at time zone 'America/Sao_Paulo')::date+180 then raise exception 'Primeira data de entrega indisponível.'; end if;
      voucher_elegivel:=true; kits_sabado:=kits_sabado and extract(dow from data_inicial)=6;
      kits:=kits||jsonb_build_array(jsonb_build_object('id',p.id,'nome',p.nome,'quantidade',qtd,'config',config_escolhida,'sabores',sabores,'primeira_data',data_inicial));
    else
      apenas:=false; if p.estoque<qtd then raise exception 'Estoque insuficiente para %.',p.nome; end if;
    end if;
    subtotal:=subtotal+round(p.preco*qtd,2);
    itens:=itens||jsonb_build_array(jsonb_build_object('id',p.id,'nome',p.nome,'descricao',p.descricao,'imagem_url',p.imagem_url,'preco',p.preco,'quantidade',qtd,'subtotal',round(p.preco*qtd,2),'tipo_produto',p.tipo_produto));
  end loop;
  if jsonb_array_length(kits)=0 then raise exception 'Este checkout exige ao menos um plano.'; end if;
  if p_metodo='voucher_presencial' and not voucher_elegivel then raise exception 'Cartão Alimentação exige que a sacola contenha um kit.'; end if;
  frete:=case when apenas and kits_sabado then 0 else coalesce((loja->>'taxa_entrega_padrao')::numeric,10) end;
  desconto:=case when subtotal>=300 then 10 else 0 end;
  if coalesce((loja->>'cupom_dia_d_ativo')::boolean,false) then desconto:=greatest(desconto,coalesce((loja->>'cupom_dia_d_percentual')::numeric,0)); end if;
  if p_cupom_id is not null then select percentual_desconto into cupom from public.cupons_desconto where id=p_cupom_id and cliente_id=uid and status='aberto' and data_validade>=now() for update; if not found then raise exception 'Cupom inválido ou expirado.'; end if; desconto:=greatest(desconto,cupom); end if;
  desconto:=least(100,greatest(0,desconto)); valor:=round(subtotal-round(subtotal*desconto/100,2)+frete,2);
  insert into public.pedidos(cliente_id,endereco_entrega,itens,valor_total,subtotal_produtos,valor_frete,desconto_percentual,desconto_valor,cupom_id,status,pagamento_status,meio_pagamento,voucher_bandeira,somente_planos,checkout_idempotencia)
  values(uid,concat_ws(', ',cli.endereco_rua,cli.endereco_numero,cli.endereco_complemento,cli.bairro,cli.regiao_df),itens,valor,subtotal,frete,desconto,round(subtotal*desconto/100,2),p_cupom_id,'Aguardando Pagamento','pending',p_metodo,case when p_metodo='voucher_presencial' then p_bandeira end,apenas,p_idempotencia) returning id into pedido;
  for k in select value from jsonb_array_elements(kits) loop
    for n in 1..(k->>'quantidade')::int loop
      insert into public.planos_marmitas(pedido_id,produto_id,cliente_id,nome,configuracao,sabores,total_marmitas,dia_semana)
      values(pedido,(k->>'id')::bigint,uid,k->>'nome',k->'config',k->'sabores',(k->'config'->>'total_marmitas')::int,extract(dow from (k->>'primeira_data')::date)) returning id into plano;
      restante:=k->'sabores'; por_entrega:=(k->'config'->>'marmitas_por_entrega')::int;
      for pos in 1..(k->'config'->>'entregas')::int loop
        entrega_itens:='[]'; faltam:=por_entrega;
        while faltam>0 loop
          for qtd in 0..jsonb_array_length(restante)-1 loop quota:=(restante->qtd->>'quantidade')::int; if quota>0 and faltam>0 then entrega_itens:=entrega_itens||jsonb_build_array(jsonb_build_object('id',(restante->qtd->>'id')::bigint,'nome',restante->qtd->>'nome','quantidade',1,'preco',0,'subtotal',0)); restante:=jsonb_set(restante,array[qtd::text,'quantidade'],to_jsonb(quota-1)); faltam:=faltam-1; end if; end loop;
        end loop;
        select jsonb_agg(jsonb_build_object('id',id,'nome',nome,'quantidade',t.qtd,'preco',0,'subtotal',0) order by id) into entrega_itens from (select (e->>'id')::bigint id,e->>'nome' nome,count(*) qtd from jsonb_array_elements(entrega_itens)e group by 1,2)t;
        insert into public.pedidos(cliente_id,endereco_entrega,itens,valor_total,status,pagamento_status,meio_pagamento,plano_id,pedido_origem_id,entrega_numero,entrega_prevista)
        select uid,endereco_entrega,entrega_itens,0,case when pos=1 and p_metodo='voucher_presencial' then 'Recebido' else 'Agendada' end,'vinculado',p_metodo,plano,pedido,pos,(k->>'primeira_data')::date+(pos-1)*(k->'config'->>'intervalo_dias')::int from public.pedidos where id=pedido returning id into filho;
      end loop;
      insert into public.planos_marmitas_historico(plano_id,evento,ator_id) values(plano,'contratado',uid);
    end loop;
  end loop;
  if valor=0 then
    for item in select value from jsonb_array_elements(itens) order by (value->>'id')::bigint loop if item->>'tipo_produto'='avulso' then update public.produtos set estoque=estoque-(item->>'quantidade')::int where id=(item->>'id')::bigint and ativo and estoque>=(item->>'quantidade')::int; if not found then raise exception 'Estoque insuficiente para %.',item->>'nome'; end if; end if; end loop;
    update public.pedidos set pagamento_status='approved',status='Recebido',meio_pagamento='isento' where id=pedido; perform public.finalizar_cupom_pedido(pedido::text);
  end if;
  return jsonb_build_object('id',pedido,'valor_total',valor,'itens',itens);
end;
$$;

-- A confirmação do Cartão Alimentação também consome os itens avulsos da
-- sacola mista; a própria guarda de pagamento aprovado garante idempotência.
create or replace function public.registrar_voucher_plano(p_entrega_id bigint,p_aprovado boolean,p_referencia text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.pedidos%rowtype; raiz public.pedidos%rowtype; p record; v_item jsonb; v_produto_id bigint; v_quantidade integer;
begin
  select * into d from public.pedidos where id=p_entrega_id;
  if not found or d.plano_id is null then raise exception 'Entrega de plano não encontrada.'; end if;
  if not public.is_viva_leve_admin() and not (public.is_viva_leve_delivery() and d.entregador_id=auth.uid() and d.status='Saiu para Entrega') then raise exception 'Acesso restrito ao responsável pela entrega.' using errcode='42501'; end if;
  select * into raiz from public.pedidos where id=d.pedido_origem_id for update;
  if raiz.meio_pagamento<>'voucher_presencial' or d.entrega_numero<>1 or raiz.pagamento_status='approved' or d.status='Cancelado' then raise exception 'Cobrança presencial não disponível.'; end if;
  if length(trim(coalesce(p_referencia,'')))<3 then raise exception 'Informe a referência/comprovante da transação ou motivo da recusa.'; end if;
  if exists(select 1 from public.planos_marmitas where pedido_id=raiz.id and status='Cancelado') then raise exception 'Pedido com plano cancelado: revise a cobrança com a administração.'; end if;
  for p in select id from public.planos_marmitas where pedido_id=raiz.id loop
    insert into public.planos_marmitas_historico(plano_id,pedido_entrega_id,evento,detalhes,ator_id)
    values(p.id,d.id,case when p_aprovado then 'voucher_confirmado' else 'voucher_recusado' end,jsonb_build_object('referencia',p_referencia,'valor',raiz.valor_total,'bandeira',raiz.voucher_bandeira),auth.uid());
  end loop;
  if p_aprovado then
    -- Itens avulsos de uma sacola mista são baixados uma única vez na confirmação presencial.
    for v_item in select value from jsonb_array_elements(coalesce(raiz.itens,'[]'::jsonb)) loop
      v_produto_id:=nullif(v_item->>'id','')::bigint;
      v_quantidade:=greatest(coalesce(nullif(v_item->>'quantidade','')::integer,0),0);
      if v_produto_id is not null and v_quantidade>0 and exists(select 1 from public.produtos where id=v_produto_id and tipo_produto<>'kit') then
        update public.produtos set estoque=estoque-v_quantidade
         where id=v_produto_id and estoque-estoque_reservado>=v_quantidade;
        if not found then raise exception 'Estoque insuficiente para confirmar o Cartão Alimentação do produto %.',v_produto_id; end if;
      end if;
    end loop;
    update public.pedidos set pagamento_status='approved',status='Recebido' where id=raiz.id;
    perform public.finalizar_cupom_pedido(raiz.id::text);
  end if;
end $$;

revoke all on function public.criar_pedido_com_planos(jsonb,text,text,uuid,uuid),public.registrar_voucher_plano(bigint,boolean,text) from public,anon;
grant execute on function public.criar_pedido_com_planos(jsonb,text,text,uuid,uuid),public.registrar_voucher_plano(bigint,boolean,text) to authenticated;
