-- Modulo financeiro: saidas, parcelas, fornecedores e receitas derivadas de pedidos.

alter table public.pedidos
  add column if not exists pago_em timestamptz;

comment on column public.pedidos.pago_em is
  'Data em que o pagamento foi efetivamente confirmado pelo meio de pagamento.';

create or replace function public.registrar_data_pagamento_pedido()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_pago boolean;
  v_antes_pago boolean;
begin
  v_pago := lower(coalesce(new.pagamento_status, '')) in ('approved', 'paid', 'pago', 'balcao');
  v_antes_pago := lower(coalesce(old.pagamento_status, '')) in ('approved', 'paid', 'pago', 'balcao');

  if v_pago and (tg_op = 'INSERT' or not v_antes_pago) then
    new.pago_em := coalesce(new.pago_em, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pedidos_registrar_pago_em on public.pedidos;
create trigger trg_pedidos_registrar_pago_em
before insert or update of pagamento_status on public.pedidos
for each row execute function public.registrar_data_pagamento_pedido();

update public.pedidos
set pago_em = coalesce(updated_at, criado_em, created_at, now())
where pago_em is null
  and lower(coalesce(pagamento_status, '')) in ('approved', 'paid', 'pago', 'balcao');

create table if not exists public.financeiro_categorias (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('insumo', 'operacional', 'investimento')),
  nome text not null check (length(trim(nome)) > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists financeiro_categorias_tipo_nome_uidx
  on public.financeiro_categorias (tipo, lower(nome));

create table if not exists public.financeiro_centros_custo (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists financeiro_centros_custo_nome_uidx
  on public.financeiro_centros_custo (lower(nome));

create table if not exists public.financeiro_fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome_razao_social text not null check (length(trim(nome_razao_social)) > 0),
  cpf_cnpj text,
  telefone text,
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists financeiro_fornecedores_nome_idx
  on public.financeiro_fornecedores (lower(nome_razao_social));

create table if not exists public.financeiro_lancamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('insumo', 'operacional', 'investimento')),
  categoria_id uuid not null references public.financeiro_categorias(id) on delete restrict,
  centro_custo_id uuid references public.financeiro_centros_custo(id) on delete restrict,
  fornecedor_id uuid references public.financeiro_fornecedores(id) on delete restrict,
  descricao text not null check (length(trim(descricao)) > 0),
  numero_documento text,
  data_compra date not null default current_date,
  valor_total numeric(14,2) not null check (valor_total > 0),
  forma_pagamento text check (forma_pagamento is null or forma_pagamento in (
    'pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'boleto', 'transferencia', 'outro'
  )),
  condicao_pagamento text not null default 'avista' check (condicao_pagamento in ('avista', 'parcelado')),
  quantidade_parcelas integer not null default 1 check (quantidade_parcelas between 1 and 120),
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'cancelado')),
  observacoes text,
  anexo_path text,
  recorrente boolean not null default false,
  frequencia_recorrencia text check (
    frequencia_recorrencia is null or frequencia_recorrencia in ('semanal', 'mensal', 'anual')
  ),
  proxima_recorrencia date,
  insumo_id bigint references public.insumos(id) on delete set null,
  quantidade_insumo numeric(14,3),
  custo_unitario numeric(14,4),
  criado_por uuid not null default auth.uid() references auth.users(id) on delete restrict,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (
    (recorrente = false and frequencia_recorrencia is null)
    or (recorrente = true and frequencia_recorrencia is not null)
  ),
  check (
    (condicao_pagamento = 'avista' and quantidade_parcelas = 1)
    or (condicao_pagamento = 'parcelado' and quantidade_parcelas >= 2)
  )
);

create index if not exists financeiro_lancamentos_data_compra_idx
  on public.financeiro_lancamentos (data_compra desc);
create index if not exists financeiro_lancamentos_tipo_idx
  on public.financeiro_lancamentos (tipo);
create index if not exists financeiro_lancamentos_categoria_idx
  on public.financeiro_lancamentos (categoria_id);
create index if not exists financeiro_lancamentos_fornecedor_idx
  on public.financeiro_lancamentos (fornecedor_id);

create table if not exists public.financeiro_parcelas (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.financeiro_lancamentos(id) on delete restrict,
  numero_parcela integer not null check (numero_parcela > 0),
  total_parcelas integer not null check (total_parcelas > 0),
  valor numeric(14,2) not null check (valor > 0),
  data_vencimento date not null,
  data_pagamento date,
  forma_pagamento text check (forma_pagamento is null or forma_pagamento in (
    'pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'boleto', 'transferencia', 'outro'
  )),
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'cancelado')),
  pago_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (lancamento_id, numero_parcela),
  check ((status = 'pago' and data_pagamento is not null) or status <> 'pago')
);

create index if not exists financeiro_parcelas_vencimento_status_idx
  on public.financeiro_parcelas (status, data_vencimento);
create index if not exists financeiro_parcelas_pagamento_idx
  on public.financeiro_parcelas (data_pagamento) where status = 'pago';

create or replace function public.financeiro_atualizar_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'financeiro_categorias', 'financeiro_centros_custo', 'financeiro_fornecedores',
    'financeiro_lancamentos', 'financeiro_parcelas'
  ] loop
    execute format('drop trigger if exists trg_%I_atualizado_em on public.%I', tabela, tabela);
    execute format(
      'create trigger trg_%I_atualizado_em before update on public.%I for each row execute function public.financeiro_atualizar_timestamp()',
      tabela, tabela
    );
  end loop;
end $$;

create or replace function public.financeiro_sincronizar_status_lancamento()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lancamento uuid := coalesce(new.lancamento_id, old.lancamento_id);
  v_total integer;
  v_pagas integer;
  v_canceladas integer;
begin
  select count(*),
         count(*) filter (where status = 'pago'),
         count(*) filter (where status = 'cancelado')
    into v_total, v_pagas, v_canceladas
  from public.financeiro_parcelas
  where lancamento_id = v_lancamento;

  update public.financeiro_lancamentos
  set status = case
    when v_total > 0 and v_canceladas = v_total then 'cancelado'
    when v_total > 0 and v_pagas = v_total then 'pago'
    else 'pendente'
  end
  where id = v_lancamento;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_financeiro_parcelas_sincronizar on public.financeiro_parcelas;
create trigger trg_financeiro_parcelas_sincronizar
after insert or update of status, data_pagamento or delete on public.financeiro_parcelas
for each row execute function public.financeiro_sincronizar_status_lancamento();

create or replace function public.criar_lancamento_financeiro(
  p_tipo text,
  p_categoria_id uuid,
  p_centro_custo_id uuid,
  p_fornecedor_id uuid,
  p_descricao text,
  p_numero_documento text,
  p_data_compra date,
  p_primeiro_vencimento date,
  p_data_pagamento date,
  p_valor_total numeric,
  p_forma_pagamento text,
  p_condicao_pagamento text,
  p_quantidade_parcelas integer,
  p_status text,
  p_observacoes text,
  p_anexo_path text,
  p_recorrente boolean default false,
  p_frequencia_recorrencia text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lancamento_id uuid;
  v_parcelas integer;
  v_total_centavos bigint;
  v_base_centavos bigint;
  v_resto bigint;
  v_valor_parcela numeric(14,2);
  v_indice integer;
  v_status_parcela text;
begin
  if not public.is_viva_leve_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;

  if p_valor_total is null or p_valor_total <= 0 then
    raise exception 'O valor total deve ser maior que zero.' using errcode = '22023';
  end if;

  v_parcelas := case when p_condicao_pagamento = 'parcelado' then greatest(coalesce(p_quantidade_parcelas, 2), 2) else 1 end;
  v_status_parcela := case when p_status = 'pago' then 'pago' when p_status = 'cancelado' then 'cancelado' else 'pendente' end;

  insert into public.financeiro_lancamentos (
    tipo, categoria_id, centro_custo_id, fornecedor_id, descricao, numero_documento,
    data_compra, valor_total, forma_pagamento, condicao_pagamento, quantidade_parcelas,
    status, observacoes, anexo_path, recorrente, frequencia_recorrencia,
    proxima_recorrencia, criado_por
  ) values (
    p_tipo, p_categoria_id, p_centro_custo_id, p_fornecedor_id, trim(p_descricao), nullif(trim(p_numero_documento), ''),
    coalesce(p_data_compra, current_date), round(p_valor_total, 2), p_forma_pagamento,
    case when v_parcelas > 1 then 'parcelado' else 'avista' end, v_parcelas,
    v_status_parcela, nullif(trim(p_observacoes), ''), p_anexo_path,
    coalesce(p_recorrente, false), case when p_recorrente then p_frequencia_recorrencia else null end,
    case
      when p_recorrente and p_frequencia_recorrencia = 'semanal' then coalesce(p_primeiro_vencimento, p_data_compra, current_date) + 7
      when p_recorrente and p_frequencia_recorrencia = 'mensal' then (coalesce(p_primeiro_vencimento, p_data_compra, current_date) + interval '1 month')::date
      when p_recorrente and p_frequencia_recorrencia = 'anual' then (coalesce(p_primeiro_vencimento, p_data_compra, current_date) + interval '1 year')::date
      else null
    end,
    auth.uid()
  ) returning id into v_lancamento_id;

  v_total_centavos := round(p_valor_total * 100)::bigint;
  v_base_centavos := v_total_centavos / v_parcelas;
  v_resto := v_total_centavos % v_parcelas;

  for v_indice in 1..v_parcelas loop
    v_valor_parcela := (v_base_centavos + case when v_indice <= v_resto then 1 else 0 end)::numeric / 100;

    insert into public.financeiro_parcelas (
      lancamento_id, numero_parcela, total_parcelas, valor, data_vencimento,
      data_pagamento, forma_pagamento, status, pago_por
    ) values (
      v_lancamento_id, v_indice, v_parcelas, v_valor_parcela,
      (coalesce(p_primeiro_vencimento, p_data_compra, current_date) + make_interval(months => v_indice - 1))::date,
      case when v_status_parcela = 'pago' then coalesce(p_data_pagamento, current_date) else null end,
      p_forma_pagamento, v_status_parcela,
      case when v_status_parcela = 'pago' then auth.uid() else null end
    );
  end loop;

  return v_lancamento_id;
end;
$$;

create or replace function public.marcar_parcela_financeira_paga(
  p_parcela_id uuid,
  p_data_pagamento date,
  p_forma_pagamento text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_viva_leve_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;

  update public.financeiro_parcelas
  set status = 'pago',
      data_pagamento = coalesce(p_data_pagamento, current_date),
      forma_pagamento = coalesce(p_forma_pagamento, forma_pagamento),
      pago_por = auth.uid()
  where id = p_parcela_id and status = 'pendente';

  if not found then
    raise exception 'Parcela pendente não encontrada.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.cancelar_lancamento_financeiro(p_lancamento_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_viva_leve_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;

  update public.financeiro_parcelas
  set status = 'cancelado', data_pagamento = null, pago_por = null
  where lancamento_id = p_lancamento_id and status = 'pendente';

  update public.financeiro_lancamentos
  set status = 'cancelado'
  where id = p_lancamento_id and status <> 'cancelado';
end;
$$;

create or replace view public.financeiro_receitas
with (security_invoker = true)
as
select
  p.id as pedido_id,
  p.pago_em as data_recebimento,
  round(coalesce(p.credito_valor_original, p.valor_total, p.total, 0), 2) as valor,
  p.meio_pagamento,
  p.pagamento_status,
  p.status as status_pedido,
  p.cliente_id
from public.pedidos p
where p.pago_em is not null
  and lower(coalesce(p.pagamento_status, '')) in ('approved', 'paid', 'pago', 'balcao')
  and lower(coalesce(p.status, '')) not in ('cancelado', 'cancelada', 'cancelled', 'refunded', 'estornado', 'estornada');

comment on view public.financeiro_receitas is
  'Receitas financeiras derivadas dos pedidos efetivamente pagos, sem duplicar lançamentos.';

insert into public.financeiro_categorias (tipo, nome)
values
  ('insumo', 'Proteínas'), ('insumo', 'Hortifruti'), ('insumo', 'Grãos'),
  ('insumo', 'Temperos'), ('insumo', 'Embalagens'), ('insumo', 'Etiquetas'),
  ('operacional', 'Água'), ('operacional', 'Energia'), ('operacional', 'Aluguel'),
  ('operacional', 'Internet'), ('operacional', 'Gás'), ('operacional', 'Marketing'),
  ('operacional', 'Manutenção'), ('operacional', 'Logística'), ('operacional', 'Tecnologia'),
  ('operacional', 'Taxas'), ('operacional', 'Serviços'),
  ('investimento', 'Equipamentos'), ('investimento', 'Mobiliário'),
  ('investimento', 'Informática'), ('investimento', 'Estrutura')
on conflict do nothing;

insert into public.financeiro_centros_custo (nome)
values ('Produção'), ('Administrativo'), ('Marketing'), ('Logística / Entregas'), ('Tecnologia')
on conflict do nothing;

alter table public.financeiro_categorias enable row level security;
alter table public.financeiro_centros_custo enable row level security;
alter table public.financeiro_fornecedores enable row level security;
alter table public.financeiro_lancamentos enable row level security;
alter table public.financeiro_parcelas enable row level security;

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'financeiro_categorias', 'financeiro_centros_custo', 'financeiro_fornecedores',
    'financeiro_lancamentos', 'financeiro_parcelas'
  ] loop
    execute format('drop policy if exists financeiro_admin_select on public.%I', tabela);
    execute format('drop policy if exists financeiro_admin_insert on public.%I', tabela);
    execute format('drop policy if exists financeiro_admin_update on public.%I', tabela);
    execute format(
      'create policy financeiro_admin_select on public.%I for select to authenticated using (public.is_viva_leve_admin())',
      tabela
    );
    execute format(
      'create policy financeiro_admin_insert on public.%I for insert to authenticated with check (public.is_viva_leve_admin())',
      tabela
    );
    execute format(
      'create policy financeiro_admin_update on public.%I for update to authenticated using (public.is_viva_leve_admin()) with check (public.is_viva_leve_admin())',
      tabela
    );
  end loop;
end $$;

revoke all on public.financeiro_categorias from anon;
revoke all on public.financeiro_centros_custo from anon;
revoke all on public.financeiro_fornecedores from anon;
revoke all on public.financeiro_lancamentos from anon;
revoke all on public.financeiro_parcelas from anon;
revoke all on public.financeiro_receitas from anon;

grant select, insert, update on public.financeiro_categorias to authenticated;
grant select, insert, update on public.financeiro_centros_custo to authenticated;
grant select, insert, update on public.financeiro_fornecedores to authenticated;
grant select, insert, update on public.financeiro_lancamentos to authenticated;
grant select, insert, update on public.financeiro_parcelas to authenticated;
grant select on public.financeiro_receitas to authenticated;
grant execute on function public.criar_lancamento_financeiro(
  text, uuid, uuid, uuid, text, text, date, date, date, numeric, text, text, integer, text, text, text, boolean, text
) to authenticated;
grant execute on function public.marcar_parcela_financeira_paga(uuid, date, text) to authenticated;
grant execute on function public.cancelar_lancamento_financeiro(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'financeiro-documentos', 'financeiro-documentos', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists financeiro_documentos_admin_select on storage.objects;
drop policy if exists financeiro_documentos_admin_insert on storage.objects;
drop policy if exists financeiro_documentos_admin_update on storage.objects;

create policy financeiro_documentos_admin_select
on storage.objects for select to authenticated
using (bucket_id = 'financeiro-documentos' and public.is_viva_leve_admin());

create policy financeiro_documentos_admin_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'financeiro-documentos' and public.is_viva_leve_admin());

create policy financeiro_documentos_admin_update
on storage.objects for update to authenticated
using (bucket_id = 'financeiro-documentos' and public.is_viva_leve_admin())
with check (bucket_id = 'financeiro-documentos' and public.is_viva_leve_admin());
