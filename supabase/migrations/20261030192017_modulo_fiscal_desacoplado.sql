-- Modulo fiscal desacoplado. A configuracao inicial fica desabilitada e em
-- homologacao; nenhuma emissao ou custo e iniciado pela migration.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.produtos
  add column if not exists fiscal_ncm text,
  add column if not exists fiscal_cest text,
  add column if not exists fiscal_cfop text,
  add column if not exists fiscal_cst text,
  add column if not exists fiscal_csosn text,
  add column if not exists fiscal_origem text,
  add column if not exists fiscal_unidade text not null default 'UN',
  add column if not exists fiscal_gtin text,
  add column if not exists fiscal_aliquota_icms numeric(7,4),
  add column if not exists fiscal_dados_extras jsonb not null default '{}'::jsonb;

alter table public.produtos
  drop constraint if exists produtos_fiscal_ncm_check,
  add constraint produtos_fiscal_ncm_check check (fiscal_ncm is null or fiscal_ncm ~ '^[0-9]{8}$'),
  drop constraint if exists produtos_fiscal_cest_check,
  add constraint produtos_fiscal_cest_check check (fiscal_cest is null or fiscal_cest ~ '^[0-9]{7}$'),
  drop constraint if exists produtos_fiscal_cfop_check,
  add constraint produtos_fiscal_cfop_check check (fiscal_cfop is null or fiscal_cfop ~ '^[0-9]{4}$'),
  drop constraint if exists produtos_fiscal_unidade_check,
  add constraint produtos_fiscal_unidade_check check (fiscal_unidade ~ '^[A-Z0-9]{1,6}$'),
  drop constraint if exists produtos_fiscal_gtin_check,
  add constraint produtos_fiscal_gtin_check check (fiscal_gtin is null or fiscal_gtin ~ '^[0-9]{8,14}$'),
  drop constraint if exists produtos_fiscal_extras_check,
  add constraint produtos_fiscal_extras_check check (jsonb_typeof(fiscal_dados_extras) = 'object');

alter table public.perfis_clientes
  add column if not exists fiscal_cpf_cnpj text,
  add column if not exists fiscal_inscricao_estadual text,
  add column if not exists fiscal_indicador_ie text,
  add column if not exists fiscal_cep text,
  add column if not exists fiscal_codigo_municipio_ibge text;

alter table public.perfis_clientes
  drop constraint if exists perfis_clientes_fiscal_cpf_cnpj_check,
  add constraint perfis_clientes_fiscal_cpf_cnpj_check check (fiscal_cpf_cnpj is null or fiscal_cpf_cnpj ~ '^[0-9]{11}([0-9]{3})?$'),
  drop constraint if exists perfis_clientes_fiscal_indicador_ie_check,
  add constraint perfis_clientes_fiscal_indicador_ie_check check (fiscal_indicador_ie is null or fiscal_indicador_ie in ('1','2','9')),
  drop constraint if exists perfis_clientes_fiscal_cep_check,
  add constraint perfis_clientes_fiscal_cep_check check (fiscal_cep is null or fiscal_cep ~ '^[0-9]{8}$'),
  drop constraint if exists perfis_clientes_fiscal_ibge_check,
  add constraint perfis_clientes_fiscal_ibge_check check (fiscal_codigo_municipio_ibge is null or fiscal_codigo_municipio_ibge ~ '^[0-9]{7}$');

create table public.fiscal_configuracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id) on delete restrict,
  modo text not null default 'disabled' check (modo in ('disabled','manual','automatic')),
  provedor text not null default 'dotcompany' check (provedor in ('dotcompany')),
  ambiente text not null default 'homologacao' check (ambiente in ('homologacao','producao')),
  tipo_documento_padrao text not null default 'nfce' check (tipo_documento_padrao in ('nfe','nfce')),
  serie_nfe text,
  serie_nfce text,
  provider_emitter_ref text,
  api_token_secret_name text not null default 'DOTCOMPANY_API_TOKEN',
  webhook_secret_name text not null default 'DOTCOMPANY_WEBHOOK_SECRET',
  max_tentativas integer not null default 4 check (max_tentativas between 1 and 10),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

create table public.documentos_fiscais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  configuracao_id uuid not null references public.fiscal_configuracoes(id) on delete restrict,
  pedido_id bigint not null references public.pedidos(id) on delete restrict,
  provedor text not null,
  tipo_documento text not null check (tipo_documento in ('nfe','nfce')),
  ambiente text not null check (ambiente in ('homologacao','producao')),
  status text not null default 'pending' check (status in ('pending','processing','authorized','rejected','error','cancelled')),
  idempotency_key uuid not null default gen_random_uuid() unique,
  numero text,
  serie text,
  chave_acesso text,
  protocolo text,
  provider_document_id text,
  valor_total numeric(14,2) not null check (valor_total >= 0),
  payload_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_snapshot) = 'object'),
  resposta_resumo jsonb not null default '{}'::jsonb check (jsonb_typeof(resposta_resumo) = 'object'),
  xml_storage_path text,
  danfe_storage_path text,
  codigo_erro text,
  mensagem_erro text,
  tentativas integer not null default 0 check (tentativas >= 0),
  proxima_tentativa_em timestamptz,
  solicitado_por uuid references auth.users(id) on delete set null,
  solicitado_em timestamptz not null default now(),
  processando_em timestamptz,
  autorizado_em timestamptz,
  cancelado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (pedido_id, tipo_documento)
);

create index documentos_fiscais_fila_idx on public.documentos_fiscais (status, proxima_tentativa_em, solicitado_em)
where status in ('pending','error');
create index documentos_fiscais_pedido_idx on public.documentos_fiscais (pedido_id);
create index documentos_fiscais_empresa_data_idx on public.documentos_fiscais (empresa_id, solicitado_em desc);

create table public.fiscal_eventos (
  id bigint generated always as identity primary key,
  documento_fiscal_id uuid not null references public.documentos_fiscais(id) on delete restrict,
  evento text not null check (evento in ('created','processing','authorized','rejected','error','retry_scheduled','cancel_requested','cancelled','webhook_received')),
  ator_id uuid references auth.users(id) on delete set null,
  detalhes jsonb not null default '{}'::jsonb check (jsonb_typeof(detalhes) = 'object'),
  criado_em timestamptz not null default now()
);
create index fiscal_eventos_documento_data_idx on public.fiscal_eventos (documento_fiscal_id, criado_em desc);

create table public.fiscal_webhook_eventos (
  event_id text primary key,
  provedor text not null default 'dotcompany',
  tipo text not null,
  documento_fiscal_id uuid references public.documentos_fiscais(id) on delete set null,
  payload_resumo jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_resumo) = 'object'),
  recebido_em timestamptz not null default now(),
  processado_em timestamptz
);

alter table public.fiscal_configuracoes enable row level security;
alter table public.documentos_fiscais enable row level security;
alter table public.fiscal_eventos enable row level security;
alter table public.fiscal_webhook_eventos enable row level security;

create policy "Administradores consultam configuracao fiscal" on public.fiscal_configuracoes
for select to authenticated using ((select public.is_viva_leve_admin()));
create policy "Administradores consultam documentos fiscais" on public.documentos_fiscais
for select to authenticated using ((select public.is_viva_leve_admin()));
create policy "Administradores consultam eventos fiscais" on public.fiscal_eventos
for select to authenticated using ((select public.is_viva_leve_admin()));
create policy "Administradores consultam webhooks fiscais" on public.fiscal_webhook_eventos
for select to authenticated using ((select public.is_viva_leve_admin()));

revoke all on public.fiscal_configuracoes, public.documentos_fiscais, public.fiscal_eventos, public.fiscal_webhook_eventos from public, anon, authenticated;
grant select on public.fiscal_configuracoes, public.documentos_fiscais, public.fiscal_eventos, public.fiscal_webhook_eventos to authenticated;
grant usage, select on sequence public.fiscal_eventos_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos-fiscais', 'documentos-fiscais', false, 10485760, array['application/pdf','application/xml','text/xml'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

insert into public.fiscal_configuracoes (empresa_id)
select id from public.empresas where principal and ativo
on conflict (empresa_id) do nothing;

create or replace function private.montar_snapshot_documento_fiscal(p_pedido_id bigint)
returns jsonb language sql security definer set search_path = public, auth, pg_temp
as $$
  select jsonb_build_object(
    'pedido', jsonb_build_object(
      'id', p.id, 'valor_total', round(coalesce(p.credito_valor_original,p.valor_total,p.total,0),2),
      'subtotal', coalesce(p.subtotal_produtos,0), 'frete', coalesce(p.valor_frete,0),
      'desconto', coalesce(p.desconto_valor,0), 'meio_pagamento', p.meio_pagamento,
      'pago_em', p.pago_em, 'itens', p.itens
    ),
    'emitente', jsonb_build_object(
      'empresa_id', e.id, 'cnpj', e.cnpj, 'nome_fantasia', e.nome_fantasia,
      'razao_social', e.razao_social, 'inscricao_estadual', e.inscricao_estadual,
      'inscricao_municipal', e.inscricao_municipal, 'regime_tributario', e.regime_tributario,
      'email', e.email, 'telefone', e.telefone, 'logradouro', e.endereco, 'numero', e.numero,
      'complemento', e.complemento, 'bairro', e.bairro, 'cep', e.cep, 'municipio', e.cidade,
      'codigo_municipio', e.codigo_municipio_ibge, 'uf', e.uf
    ),
    'destinatario', jsonb_build_object(
      'nome', coalesce(pc.nome_completo,pf.nome,p.cliente_nome_balcao),
      'cpf_cnpj', pc.fiscal_cpf_cnpj, 'inscricao_estadual', pc.fiscal_inscricao_estadual,
      'indicador_ie', pc.fiscal_indicador_ie, 'email', u.email,
      'telefone', coalesce(pc.telefone,pf.telefone,p.cliente_telefone_balcao),
      'logradouro', pc.endereco_rua, 'numero', pc.endereco_numero,
      'complemento', pc.endereco_complemento, 'bairro', pc.bairro,
      'municipio', pc.regiao_df, 'codigo_municipio', pc.fiscal_codigo_municipio_ibge,
      'uf', pc.endereco_uf, 'cep', pc.fiscal_cep
    ),
    'produtos_fiscais', coalesce((
      select jsonb_object_agg(prod.id::text, jsonb_build_object(
        'ncm',prod.fiscal_ncm,'cest',prod.fiscal_cest,'cfop',prod.fiscal_cfop,
        'cst',prod.fiscal_cst,'csosn',prod.fiscal_csosn,'origem',prod.fiscal_origem,
        'unidade',prod.fiscal_unidade,'gtin',prod.fiscal_gtin,
        'aliquota_icms',prod.fiscal_aliquota_icms,'extras',prod.fiscal_dados_extras
      ))
      from public.produtos prod
      where prod.id in (select nullif(item->>'id','')::bigint from jsonb_array_elements(p.itens) item)
    ), '{}'::jsonb)
  )
  from public.pedidos p
  join public.empresas e on e.principal and e.ativo
  left join public.perfis_clientes pc on pc.id=p.cliente_id
  left join public.perfis pf on pf.id=p.cliente_id
  left join auth.users u on u.id=p.cliente_id
  where p.id=p_pedido_id
$$;
revoke all on function private.montar_snapshot_documento_fiscal(bigint) from public, anon, authenticated;

create or replace function public.criar_documento_fiscal_manual(
  p_pedido_id bigint,
  p_tipo_documento text,
  p_administrador_id uuid
) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare v_pedido public.pedidos%rowtype; v_cfg public.fiscal_configuracoes%rowtype; v_id uuid;
begin
  if current_user <> 'postgres' and coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Operacao exclusiva do backend.'; end if;
  if p_tipo_documento not in ('nfe','nfce') then raise exception 'Tipo de documento invalido.'; end if;
  select * into v_pedido from public.pedidos where id=p_pedido_id;
  if not found or v_pedido.pedido_origem_id is not null then raise exception 'Pedido elegivel nao encontrado.'; end if;
  if coalesce(v_pedido.pagamento_status,'') <> 'approved' then raise exception 'Somente pedidos com pagamento aprovado podem emitir documento fiscal.'; end if;
  if coalesce(v_pedido.status,'')='Cancelado' then raise exception 'Pedido cancelado nao pode emitir documento fiscal.'; end if;
  select fc.* into v_cfg from public.fiscal_configuracoes fc join public.empresas e on e.id=fc.empresa_id
   where e.principal and e.ativo and fc.ativo limit 1;
  if not found or v_cfg.modo='disabled' then raise exception 'Modulo fiscal desabilitado.'; end if;
  insert into public.documentos_fiscais(
    empresa_id,configuracao_id,pedido_id,provedor,tipo_documento,ambiente,valor_total,payload_snapshot,solicitado_por
  ) values (
    v_cfg.empresa_id,v_cfg.id,v_pedido.id,v_cfg.provedor,p_tipo_documento,v_cfg.ambiente,
    round(coalesce(v_pedido.credito_valor_original,v_pedido.valor_total,v_pedido.total,0),2),
    private.montar_snapshot_documento_fiscal(v_pedido.id),p_administrador_id
  ) on conflict (pedido_id,tipo_documento) do update set atualizado_em=public.documentos_fiscais.atualizado_em
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.criar_documento_fiscal_manual(bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.criar_documento_fiscal_manual(bigint,text,uuid) to service_role;

create or replace function private.enfileirar_documento_fiscal_automatico()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare v_cfg public.fiscal_configuracoes%rowtype;
begin
  if new.pedido_origem_id is not null
     or coalesce(new.pagamento_status,'') <> 'approved'
     or (tg_op='UPDATE' and coalesce(old.pagamento_status,'')='approved')
     or coalesce(new.status,'')='Cancelado'
     or round(coalesce(new.credito_valor_original,new.valor_total,new.total,0),2) <= 0 then
    return new;
  end if;
  select fc.* into v_cfg from public.fiscal_configuracoes fc
  join public.empresas e on e.id=fc.empresa_id
  where e.principal and e.ativo and fc.ativo and fc.modo='automatic' limit 1;
  if not found then return new; end if;
  insert into public.documentos_fiscais(
    empresa_id,configuracao_id,pedido_id,provedor,tipo_documento,ambiente,valor_total,payload_snapshot
  ) values (
    v_cfg.empresa_id,v_cfg.id,new.id,v_cfg.provedor,v_cfg.tipo_documento_padrao,v_cfg.ambiente,
    round(coalesce(new.credito_valor_original,new.valor_total,new.total,0),2),
    private.montar_snapshot_documento_fiscal(new.id)
  ) on conflict (pedido_id,tipo_documento) do nothing;
  return new;
end;
$$;
revoke all on function private.enfileirar_documento_fiscal_automatico() from public, anon, authenticated;

drop trigger if exists pedidos_enfileirar_documento_fiscal on public.pedidos;
create trigger pedidos_enfileirar_documento_fiscal
after insert or update of pagamento_status on public.pedidos
for each row execute function private.enfileirar_documento_fiscal_automatico();

create or replace function private.registrar_criacao_documento_fiscal()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.fiscal_eventos(documento_fiscal_id,evento,ator_id,detalhes)
  values(new.id,'created',new.solicitado_por,jsonb_build_object('modo',(
    select modo from public.fiscal_configuracoes where id=new.configuracao_id
  ),'ambiente',new.ambiente,'tipo_documento',new.tipo_documento));
  return new;
end;
$$;
revoke all on function private.registrar_criacao_documento_fiscal() from public, anon, authenticated;
create trigger documentos_fiscais_registrar_criacao after insert on public.documentos_fiscais
for each row execute function private.registrar_criacao_documento_fiscal();

-- O cron apenas chama a Edge Function que drena a fila. A chave de API fiscal
-- permanece exclusivamente nos Secrets da Function, nunca no banco ou frontend.
do $$
begin
  if to_regnamespace('cron') is not null and to_regnamespace('net') is not null and to_regnamespace('vault') is not null then
    begin perform cron.unschedule('viva-leve-fiscal-outbox'); exception when others then null; end;
    perform cron.schedule('viva-leve-fiscal-outbox','*/2 * * * *',$job$
      select net.http_post(
        url:='https://kdhdtdwayqdbkxbbpawm.supabase.co/functions/v1/fiscal-dispatch',
        body:='{"action":"drain"}'::jsonb,
        headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='viva_leve_push_cron')),
        timeout_milliseconds:=30000
      );
    $job$);
  end if;
end;
$$;

comment on table public.fiscal_configuracoes is 'Preferencias fiscais por empresa. Segredos ficam nos Supabase Edge Function Secrets.';
comment on table public.documentos_fiscais is 'Fila e ciclo de vida idempotente dos documentos fiscais, desacoplado do pagamento.';
comment on column public.produtos.fiscal_ncm is 'Classificacao fiscal; deve ser validada pela contabilidade antes da emissao.';
