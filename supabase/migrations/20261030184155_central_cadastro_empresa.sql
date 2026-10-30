-- Cadastro-mestre da empresa da instalação. Nesta versão existe uma única
-- empresa principal ativa, sem assumir um identificador numérico fixo.
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  principal boolean not null default false,
  ativo boolean not null default true,
  nome_fantasia text not null check (length(btrim(nome_fantasia)) between 2 and 120),
  razao_social text,
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  inscricao_estadual text,
  inscricao_municipal text,
  regime_tributario text,
  email text,
  telefone text,
  whatsapp text,
  site text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  youtube_url text,
  linkedin_url text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  cidade text,
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  codigo_municipio_ibge text check (codigo_municipio_ibge is null or codigo_municipio_ibge ~ '^[0-9]{7}$'),
  pais text not null default 'Brasil',
  missao text,
  visao text,
  valores jsonb not null default '[]'::jsonb check (jsonb_typeof(valores) = 'array'),
  descricao_empresa text,
  slogan text,
  texto_sobre text,
  mensagem_institucional text,
  descricao_curta_loja text,
  mensagem_rodape text,
  logo_url text,
  simbolo_url text,
  logo_reduzida_url text,
  favicon_url text,
  logo_fundo_claro_url text,
  logo_fundo_escuro_url text,
  imagem_institucional_url text,
  cor_primaria text check (cor_primaria is null or cor_primaria ~ '^#[0-9A-Fa-f]{6}$'),
  cor_secundaria text check (cor_secundaria is null or cor_secundaria ~ '^#[0-9A-Fa-f]{6}$'),
  cor_destaque text check (cor_destaque is null or cor_destaque ~ '^#[0-9A-Fa-f]{6}$'),
  cor_fundo text check (cor_fundo is null or cor_fundo ~ '^#[0-9A-Fa-f]{6}$'),
  cor_texto text check (cor_texto is null or cor_texto ~ '^#[0-9A-Fa-f]{6}$'),
  cor_botao text check (cor_botao is null or cor_botao ~ '^#[0-9A-Fa-f]{6}$'),
  cor_texto_botao text check (cor_texto_botao is null or cor_texto_botao ~ '^#[0-9A-Fa-f]{6}$'),
  seo_titulo text,
  seo_descricao text,
  seo_imagem_url text,
  seo_nome_empresa text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index empresas_uma_principal_uidx on public.empresas (principal) where principal;
create index empresas_ativa_idx on public.empresas (ativo, principal) where ativo;

create table public.empresa_auditoria (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id) on delete restrict,
  administrador_id uuid references auth.users(id) on delete set null,
  campo text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  alterado_em timestamptz not null default now()
);
create index empresa_auditoria_empresa_data_idx on public.empresa_auditoria (empresa_id, alterado_em desc);

create or replace function public.atualizar_updated_at_empresa()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger empresas_atualizar_updated_at
before update on public.empresas
for each row execute function public.atualizar_updated_at_empresa();

alter table public.empresas enable row level security;
alter table public.empresa_auditoria enable row level security;

create policy "Empresa principal ativa e publica"
on public.empresas for select to anon, authenticated
using (ativo = true and principal = true);

create policy "Administradores leem auditoria da empresa"
on public.empresa_auditoria for select to authenticated
using ((select public.is_viva_leve_admin()));

revoke insert, update, delete on public.empresas from anon, authenticated;
revoke insert, update, delete on public.empresa_auditoria from anon, authenticated;
grant select on public.empresas to anon, authenticated;
grant select on public.empresa_auditoria to authenticated;
grant usage, select on sequence public.empresa_auditoria_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'empresa-assets', 'empresa-assets', true, 5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Administradores enviam ativos da empresa"
on storage.objects for insert to authenticated
with check (bucket_id = 'empresa-assets' and (select public.is_viva_leve_admin()));

create policy "Ativos publicos da empresa"
on storage.objects for select to anon, authenticated
using (bucket_id = 'empresa-assets');

insert into public.empresas (
  slug, principal, ativo, nome_fantasia, razao_social, cnpj, email, telefone,
  whatsapp, site, endereco, numero, complemento, cep, cidade, uf, pais,
  slogan, descricao_empresa, descricao_curta_loja, mensagem_rodape,
  cor_primaria, cor_secundaria, cor_destaque, cor_fundo, cor_texto,
  cor_botao, cor_texto_botao, seo_titulo, seo_descricao, seo_nome_empresa
) values (
  'viva-leve', true, true, 'Viva Leve',
  '62.496.248 LUIZ RICARDO MENDES BRANQUINHO', '62496248000142',
  'vivaleve.df@gmail.com', '6191299996', '556191299996',
  'https://www.vivalevedf.com.br', 'Rua 91, Quadra 51, Lote 5', 'Loja 2', null,
  '72871091', 'Valparaíso de Goiás', 'GO', 'Brasil', 'Saúde e praticidade',
  'Alimentação saudável e prática para transformar sua rotina.',
  'Comida saudável e rastreamento de dieta.',
  'Transformando sua rotina com alimentação saudável e prática.',
  '#4B0082', '#BFFF00', '#BFFF00', '#F1F5F2', '#111827', '#BFFF00', '#4B0082',
  'Viva Leve', 'Comida saudável e rastreamento de dieta.', 'Viva Leve'
)
on conflict (slug) do nothing;

-- Preserva os canais já administrados pela instalação quando a tabela legado existe.
do $$
begin
  if to_regclass('public.canais_loja') is not null then
    execute $sql$
      update public.empresas empresa
      set instagram_url = coalesce(empresa.instagram_url, (
            select canal.endereco from public.canais_loja canal
            where lower(canal.nome_rede) like '%instagram%' and canal.ativo = true limit 1
          )),
          whatsapp = coalesce(nullif(regexp_replace(empresa.whatsapp, '[^0-9]', '', 'g'), ''), (
            select nullif(regexp_replace(canal.endereco, '[^0-9]', '', 'g'), '') from public.canais_loja canal
            where lower(canal.nome_rede) like '%whatsapp%' and canal.ativo = true limit 1
          ))
      where empresa.slug = 'viva-leve'
    $sql$;
    execute 'alter table public.canais_loja add column if not exists empresa_id uuid references public.empresas(id) on delete restrict';
    execute 'update public.canais_loja set empresa_id = (select id from public.empresas where principal and ativo limit 1) where empresa_id is null';
    execute 'create index if not exists canais_loja_empresa_idx on public.canais_loja (empresa_id)';
  end if;
end;
$$;

-- Preferências existentes passam a conhecer a empresa sem alterar sua chave
-- ou as consultas atuais. A coluna fica pronta para a evolução comercial.
alter table public.app_config add column if not exists empresa_id uuid references public.empresas(id) on delete restrict;
update public.app_config set empresa_id = (select id from public.empresas where principal and ativo limit 1)
where empresa_id is null;
create index if not exists app_config_empresa_idx on public.app_config (empresa_id);


comment on table public.empresas is 'Cadastro-mestre institucional, fiscal, de contato, SEO e identidade visual da instalação.';
comment on table public.empresa_auditoria is 'Histórico de alterações do cadastro-mestre; segredos nunca devem ser registrados.';
