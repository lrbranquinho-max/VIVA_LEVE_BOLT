alter table public.produtos
  add column if not exists imagem_thumbnail_url text,
  add column if not exists imagem_detalhe_url text;

comment on column public.produtos.imagem_url is
  'Imagem original preservada para auditoria e eventual reprocessamento.';
comment on column public.produtos.imagem_thumbnail_url is
  'WebP versionado, ate 480 px, usado nas listagens e seletores.';
comment on column public.produtos.imagem_detalhe_url is
  'WebP versionado, ate 1200 px, usado na pagina de detalhe.';

create table if not exists public.produtos_imagens_backup (
  id bigint generated always as identity primary key,
  backup_tag text not null,
  produto_id bigint not null references public.produtos(id) on delete restrict,
  imagem_url text,
  imagem_thumbnail_url text,
  imagem_detalhe_url text,
  criado_em timestamptz not null default now(),
  unique (backup_tag, produto_id)
);

create table if not exists public.produtos_imagens_variantes (
  produto_id bigint primary key references public.produtos(id) on delete restrict,
  original_url text not null,
  thumbnail_url text not null,
  detalhe_url text not null,
  original_path text,
  thumbnail_path text not null,
  detalhe_path text not null,
  original_bytes bigint not null check (original_bytes >= 0),
  thumbnail_bytes bigint not null check (thumbnail_bytes > 0),
  detalhe_bytes bigint not null check (detalhe_bytes > 0),
  hash text not null,
  preparado_em timestamptz not null default now(),
  aplicado_em timestamptz
);

alter table public.produtos_imagens_backup enable row level security;
alter table public.produtos_imagens_variantes enable row level security;

revoke all on public.produtos_imagens_backup from public, anon, authenticated;
revoke all on public.produtos_imagens_variantes from public, anon, authenticated;
grant all on public.produtos_imagens_backup to service_role;
grant all on public.produtos_imagens_variantes to service_role;
grant usage, select on sequence public.produtos_imagens_backup_id_seq to service_role;

create index if not exists produtos_imagens_backup_produto_idx
  on public.produtos_imagens_backup (produto_id, criado_em desc);

