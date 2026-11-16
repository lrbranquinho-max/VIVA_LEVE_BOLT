const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261116185126_prazo_minimo_entrega_d_mais_3.sql'), 'utf8');

test('migration preserva pedidos existentes e aplica D+3 somente a novos pedidos', async () => {
  const db = new PGlite();
  await db.exec(`
    create table public.pedidos (
      id bigint generated always as identity primary key,
      plano_id uuid,
      pedido_origem_id bigint,
      entrega_prevista date,
      itens jsonb not null default '[]'::jsonb
    );
    insert into public.pedidos (itens) values ('[{"tipo_produto":"avulso"}]');
  `);
  await db.exec(migration);

  const anterior = await db.query('select entrega_prevista from public.pedidos where id = 1');
  assert.equal(anterior.rows[0].entrega_prevista, null);

  const avulso = await db.query(`
    insert into public.pedidos (itens)
    values ('[{"tipo_produto":"avulso"}]')
    returning entrega_prevista::text
  `);
  const minima = await db.query(`select ((now() at time zone 'America/Sao_Paulo')::date + 3)::text as data`);
  assert.equal(avulso.rows[0].entrega_prevista, minima.rows[0].data);

  const raizKit = await db.query(`
    insert into public.pedidos (itens)
    values ('[{"tipo_produto":"kit"}]')
    returning id, entrega_prevista
  `);
  assert.equal(raizKit.rows[0].entrega_prevista, null);

  await assert.rejects(
    db.exec(`insert into public.pedidos (plano_id, pedido_origem_id, entrega_prevista)
      values ('00000000-0000-0000-0000-000000000001', ${raizKit.rows[0].id}, (now() at time zone 'America/Sao_Paulo')::date + 2)`),
    /data mínima de entrega/i,
  );
  await db.exec(`insert into public.pedidos (plano_id, pedido_origem_id, entrega_prevista)
    values ('00000000-0000-0000-0000-000000000001', ${raizKit.rows[0].id}, (now() at time zone 'America/Sao_Paulo')::date + 3)`);

  await db.close();
});

test('checkout informa a data D+3 antes de prosseguir ao pagamento', () => {
  const pagina = fs.readFileSync(path.join(process.cwd(), 'app/page.tsx'), 'utf8');
  const seletor = fs.readFileSync(path.join(process.cwd(), 'components/PlanoKitSelector.tsx'), 'utf8');

  assert.match(pagina, /Prazo temporário de entrega/);
  assert.match(pagina, /Primeira data disponível/);
  assert.match(pagina, /requestSubmit\(\)/);
  assert.match(pagina, /entrega_prevista: dataMinimaPedido/);
  assert.match(seletor, /Math\.max\(config\?\.antecedencia_dias \|\| 1, PRAZO_MINIMO_ENTREGA_DIAS\)/);
});
