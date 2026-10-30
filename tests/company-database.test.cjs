const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

let db;
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email text);
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function public.is_viva_leve_admin() returns boolean language sql stable as $$ select false $$;
    create table public.app_config(chave text primary key,valor jsonb not null default '{}');
    create table public.canais_loja(nome_rede text,endereco text,ativo boolean default true);
    insert into public.canais_loja values ('Instagram','https://instagram.com/vivaleve',true);
  `);
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261030184155_central_cadastro_empresa.sql'), 'utf8'));
});
after(async () => { await db?.close(); });

test('migration executa integralmente e migra a empresa Viva Leve', async () => {
  const rows = (await db.query('select * from empresas where principal and ativo')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nome_fantasia, 'Viva Leve');
  assert.equal(rows[0].cnpj, '62496248000142');
  assert.equal(rows[0].instagram_url, 'https://instagram.com/vivaleve');
  assert.deepEqual(rows[0].valores, []);
});

test('banco impede duas empresas principais e CNPJ fora do formato normalizado', async () => {
  await assert.rejects(db.query("insert into empresas(slug,principal,nome_fantasia) values('outra',true,'Outra')"));
  await assert.rejects(db.query("insert into empresas(slug,nome_fantasia,cnpj) values('invalida','Inválida','62.496.248/0001-42')"));
});

test('bucket limita arquivos e preferências ficam vinculadas à empresa', async () => {
  const bucket = (await db.query("select * from storage.buckets where id='empresa-assets'")).rows[0];
  assert.equal(Number(bucket.file_size_limit), 5 * 1024 * 1024);
  assert.deepEqual(bucket.allowed_mime_types, ['image/png','image/jpeg','image/webp']);
  await db.query("insert into app_config(chave,valor) values('teste','{}')");
  await db.query("update app_config set empresa_id=(select id from empresas where principal)");
  assert.equal((await db.query('select count(*)::int n from app_config where empresa_id is not null')).rows[0].n, 1);
});

test('auditoria preserva empresa e impede exclusão em cascata', async () => {
  const id = (await db.query('select id from empresas where principal')).rows[0].id;
  await db.query("insert into empresa_auditoria(empresa_id,campo,valor_anterior,valor_novo) values($1,'nome_fantasia','\"A\"','\"B\"')", [id]);
  await assert.rejects(db.query('delete from empresas where id=$1', [id]));
});
