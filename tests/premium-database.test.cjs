const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
let db;
let plans;
const actor = '10000000-0000-4000-8000-000000000001';
const user = '10000000-0000-4000-8000-000000000002';
const unverified = '10000000-0000-4000-8000-000000000003';
const other = '10000000-0000-4000-8000-000000000004';
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    create table public.admin_usuario_roles(email text,role text,ativo boolean);
    grant select on public.admin_usuario_roles to service_role;
    insert into auth.users values
      ('${actor}','admin@example.invalid',now()),('${user}','user@example.invalid',now()),
      ('${unverified}','pending@example.invalid',null),('${other}','other@example.invalid',now());
    insert into public.admin_usuario_roles values ('admin@example.invalid','admin',true);
  `);
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260906112026_premium_planos_base.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260906200553_premium_frete_transicao.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260906215923_premium_operacoes.sql'), 'utf8'));
  plans = Object.fromEntries((await db.query('select * from premium_plans')).rows.map(p => [p.code, p]));
});
after(async () => { await db?.close(); });
async function transaction(fn) {
  await db.exec('begin');
  try { return await fn(); } finally { await db.exec('rollback'); }
}
async function grant(key, code = 'completo', source = 'ADMIN', target = user, duration = 30, sourceId = key, partner = null) {
  const result = await db.query('select premium_grant_access($1,$2,$3,$4,$5,$6,$7,$8,$9) as id',
    [target, plans[code].id, duration, source, sourceId, key, actor, 'Isolated automated test', partner]);
  return result.rows[0].id;
}
test('migration inicia desativada, com tres planos e Grupo VIP configurados', async () => {
  const config = (await db.query('select * from premium_settings')).rows[0];
  assert.equal(config.commercial_enabled, false);
  assert.equal(config.enforcement_enabled, false);
  assert.equal(config.purchase_reward_enabled, false);
  assert.equal(config.purchase_minimum_cents, 15000);
  assert.equal(plans.completo.price_cents, 1590);
  assert.equal(plans.dieta.price_cents, 990);
  assert.equal(plans.treino.price_cents, 990);
  assert.equal((await db.query('select count(*)::int n from premium_partners')).rows[0].n, 1);
});
test('primeira concessao libera todos os recursos por 30 dias', () => transaction(async () => {
  await db.exec('set local role service_role');
  await grant('first');
  const rows = (await db.query('select extract(epoch from (expires_at-start_at))/86400 days from premium_resource_periods')).rows;
  assert.equal(rows.length, 3);
  for (const row of rows) assert.equal(Number(row.days), 30);
}));
test('frete conta no minimo e transicao Completo de 30 dias aguarda ativacao', async () => {
  const config = (await db.query('select * from premium_settings')).rows[0];
  assert.equal(config.purchase_include_shipping, true);
  assert.equal(config.transition_enabled, true);
  assert.equal(config.transition_duration_days, 30);
  assert.equal(config.transition_plan_id, plans.completo.id);
  assert.equal(config.transition_starts_at, null);
  assert.equal(config.commercial_enabled, false);
  assert.equal(config.enforcement_enabled, false);
  assert.equal(config.purchase_reward_enabled, false);
  assert.equal((await db.query('select count(*)::int n from premium_grants')).rows[0].n, 0);
});
test('decisao comercial registra antes e depois na auditoria', async () => {
  const row = (await db.query("select * from premium_audit where entity='premium_settings' and action='UPDATE' order by created_at desc limit 1")).rows[0];
  assert.equal(row.before_state.purchase_include_shipping, false);
  assert.equal(row.after_state.purchase_include_shipping, true);
  assert.equal(row.after_state.transition_duration_days, 30);
  assert.equal(row.agent, 'migration:user_decision_2026_09_06');
});
test('transicao habilitada exige plano', () => transaction(async () => {
  await assert.rejects(db.exec('update premium_settings set transition_plan_id=null'), /check constraint/);
}));
test('renovacao antecipada acumula sem perder dias; novo webhook nao repete', () => transaction(async () => {
  const first = await grant('one');
  assert.equal(await grant('one'), first);
  await grant('two', 'completo', 'SUBSCRIPTION');
  const rows = (await db.query('select extract(epoch from (max(expires_at)-now()))/86400 days from premium_resource_periods group by resource')).rows;
  for (const row of rows) assert.equal(Number(row.days), 60);
  assert.equal((await db.query('select count(*)::int n from premium_grants')).rows[0].n, 2);
}));
test('mesmo pedido nao pode conceder novamente com outra chave', () => transaction(async () => {
  await grant('order-event-1', 'completo', 'PURCHASE_REWARD', user, 30, 'order-123');
  await assert.rejects(grant('order-event-2', 'completo', 'PURCHASE_REWARD', user, 30, 'order-123'), /duplicate key/);
}));
test('reuso de chave para outro beneficiario falha', () => transaction(async () => {
  await grant('same');
  await assert.rejects(grant('same', 'completo', 'ADMIN', other), /Idempotency key conflict/);
}));
test('conta sem email confirmado nao recebe concessao', () => transaction(async () => {
  await assert.rejects(grant('unverified', 'completo', 'ADMIN', unverified), /Verified account/);
}));
test('plano inativo impede novas concessoes', () => transaction(async () => {
  await db.query('update premium_plans set active=false where id=$1', [plans.completo.id]);
  await assert.rejects(grant('inactive'), /Inactive plan/);
}));
test('Dieta anterior nao atrasa liberacao do Treino no Completo', () => transaction(async () => {
  await grant('diet', 'dieta');
  await grant('complete');
  const rows = (await db.query('select resource, extract(epoch from (max(expires_at)-now()))/86400 days from premium_resource_periods group by resource')).rows;
  assert.equal(Number(rows.find(r => r.resource==='training.access').days), 30);
  assert.equal(Number(rows.find(r => r.resource==='diet.generate').days), 60);
}));
test('renovacao de periodo vencido conta a partir de agora', () => transaction(async () => {
  await grant('old');
  await db.exec("update premium_resource_periods set start_at=start_at-interval '60 days',expires_at=expires_at-interval '60 days'");
  await grant('renewed', 'completo', 'SUBSCRIPTION');
  const row = (await db.query('select extract(epoch from (max(expires_at)-now()))/86400 days from premium_resource_periods')).rows[0];
  assert.equal(Number(row.days), 30);
}));
test('KEEP_ACTIVE nao reduz saldo e nao impede renovacao paga', () => transaction(async () => {
  await grant('initial');
  await db.exec("update premium_settings set accumulation_policy='KEEP_ACTIVE'");
  await grant('benefit');
  assert.equal((await db.query('select count(*)::int n from premium_resource_periods')).rows[0].n, 3);
  await grant('paid', 'completo', 'SUBSCRIPTION');
  const row = (await db.query('select extract(epoch from (max(expires_at)-now()))/86400 days from premium_resource_periods')).rows[0];
  assert.equal(Number(row.days), 60);
}));
test('VIP usa parceiro e mesma funcao de concessao', () => transaction(async () => {
  const partner = (await db.query('select id from premium_partners')).rows[0].id;
  await grant('vip-september', 'completo', 'VIP_GROUP', user, 30, partner, partner);
  const row = (await db.query('select source_type,partner_id from premium_grants')).rows[0];
  assert.equal(row.source_type, 'VIP_GROUP');
  assert.equal(row.partner_id, partner);
}));
test('parceiro inativo nao concede', () => transaction(async () => {
  const partner = (await db.query('select id from premium_partners')).rows[0].id;
  await db.exec('update premium_partners set active=false');
  await assert.rejects(grant('vip', 'completo', 'VIP_GROUP', user, 30, partner, partner), /Invalid partner benefit/);
}));
test('RLS isola acessos e bloqueia alteracao de validade', () => transaction(async () => {
  await grant('private');
  await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${other}',true)`);
  assert.equal((await db.query('select * from premium_grants')).rows.length, 0);
  assert.equal((await db.query("select premium_has_access('training.access') allowed")).rows[0].allowed, false);
  await db.exec(`select set_config('request.jwt.claim.sub','${user}',true)`);
  assert.equal((await db.query('select * from premium_grants')).rows.length, 1);
  assert.equal((await db.query("select premium_has_access('training.access') allowed")).rows[0].allowed, true);
  await assert.rejects(db.exec("update premium_grants set expires_at=now()+interval '10 years'"), /permission denied/);
}));
test('visitante nao executa concessao', () => transaction(async () => {
  await db.exec('set local role anon');
  await assert.rejects(grant('attack'), /permission denied/);
}));
test('usuario autenticado nao executa concessao', () => transaction(async () => {
  await db.exec('set local role authenticated');
  await assert.rejects(grant('attack'), /permission denied/);
}));
test('vencimento exato e cancelamento bloqueiam acesso', () => transaction(async () => {
  await grant('expired');
  await db.exec("update premium_resource_periods set start_at=now()-interval '30 days',expires_at=now()");
  await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true)`);
  assert.equal((await db.query("select premium_has_access('training.access') allowed")).rows[0].allowed, false);
  await db.exec('reset role');
  await grant('cancel');
  await db.exec("update premium_grants set status='CANCELLED'");
  await db.exec(`set local role authenticated`);
  assert.equal((await db.query("select premium_has_access('training.access') allowed")).rows[0].allowed, false);
}));
test('edicao administrativa registra ator, antes/depois e preserva snapshot', () => transaction(async () => {
  await grant('snapshot');
  await db.exec('set local role service_role');
  const input = { ...plans.completo, price_cents: 2000 };
  await db.query('select premium_admin_save_plan($1,$2)', [actor, JSON.stringify(input)]);
  const snapshot = (await db.query('select plan_snapshot from premium_grants')).rows[0].plan_snapshot;
  assert.equal(snapshot.price_cents, 1590);
  const audit = (await db.query("select * from premium_audit where action='UPDATE' and entity='premium_plans'")).rows[0];
  assert.equal(audit.actor_id, actor);
  assert.equal(audit.before_state.price_cents, 1590);
  assert.equal(audit.after_state.price_cents, 2000);
  assert.equal(audit.after_state.version, 2);
  await assert.rejects(db.query('select premium_admin_save_plan($1,$2)', [actor, JSON.stringify(input)]), /Configuration changed/);
}));
test('API privilegiada nao pode editar em nome de nao administrador', () => transaction(async () => {
  await db.exec('set local role service_role');
  await assert.rejects(db.query('select premium_admin_save_plan($1,$2)', [user, JSON.stringify(plans.completo)]), /Administrator required/);
}));
test('auditoria nao permite alteracao pela chave de servico', () => transaction(async () => {
  await db.exec('set local role service_role');
  await assert.rejects(db.exec("update premium_audit set action='changed'"), /permission denied/);
}));
test('pagamento confirmado com valor exato concede uma vez', () => transaction(async () => {
  const checkout='20000000-0000-4000-8000-000000000001';
  await db.query(`insert into premium_checkouts(id,user_id,plan_id,plan_snapshot,amount_cents,duration_days,gateway,idempotency_key)
    values($1,$2,$3,$4,1590,30,'MERCADO_PAGO','20000000-0000-4000-8000-000000000002')`,[checkout,user,plans.completo.id,plans.completo]);
  const first=(await db.query("select premium_record_payment($1,'pay-1','approved',1590,'accredited') id",[checkout])).rows[0].id;
  const again=(await db.query("select premium_record_payment($1,'pay-1','approved',1590,'accredited') id",[checkout])).rows[0].id;
  assert.equal(first,again);
  assert.equal((await db.query("select count(*)::int n from premium_grants where source_type='SUBSCRIPTION'")).rows[0].n,1);
  assert.equal((await db.query('select status from premium_checkouts where id=$1',[checkout])).rows[0].status,'APPROVED');
}));
test('pagamento aprovado com valor divergente nao concede', () => transaction(async () => {
  const checkout='20000000-0000-4000-8000-000000000003';
  await db.query(`insert into premium_checkouts(id,user_id,plan_id,plan_snapshot,amount_cents,duration_days,gateway,idempotency_key)
    values($1,$2,$3,$4,1590,30,'MERCADO_PAGO','20000000-0000-4000-8000-000000000004')`,[checkout,user,plans.completo.id,plans.completo]);
  await assert.rejects(db.query("select premium_record_payment($1,'pay-wrong','approved',990,'accredited')",[checkout]),/amount mismatch/);
}));
test('pagamento pendente ou recusado nao concede', () => transaction(async () => {
  for(const [i,status] of ['pending','rejected'].entries()){
    const checkout=`20000000-0000-4000-8000-00000000000${5+i}`;
    const key=`20000000-0000-4000-8000-00000000000${7+i}`;
    await db.query(`insert into premium_checkouts(id,user_id,plan_id,plan_snapshot,amount_cents,duration_days,gateway,idempotency_key)
      values($1,$2,$3,$4,1590,30,'MERCADO_PAGO',$5)`,[checkout,user,plans.completo.id,plans.completo,key]);
    await db.query('select premium_record_payment($1,$2,$3,1590,null)',[checkout,`pay-${status}`,status]);
  }
  assert.equal((await db.query("select count(*)::int n from premium_grants where source_type='SUBSCRIPTION'")).rows[0].n,0);
}));
test('estorno sinaliza revisao sem apagar dias utilizados', () => transaction(async () => {
  const checkout='20000000-0000-4000-8000-000000000009';
  await db.query(`insert into premium_checkouts(id,user_id,plan_id,plan_snapshot,amount_cents,duration_days,gateway,idempotency_key)
    values($1,$2,$3,$4,1590,30,'MERCADO_PAGO','20000000-0000-4000-8000-000000000010')`,[checkout,user,plans.completo.id,plans.completo]);
  await db.query("select premium_record_payment($1,'pay-refund','approved',1590,null)",[checkout]);
  await db.query("select premium_record_payment($1,'pay-refund','refunded',1590,null)",[checkout]);
  assert.equal((await db.query("select status from premium_grants where source_id='pay-refund'")).rows[0].status,'REVIEW_REQUIRED');
  assert.equal((await db.query("select count(*)::int n from premium_resource_periods")).rows[0].n,3);
}));
test('beneficio pendente ativa somente para a conta do email verificado', () => transaction(async () => {
  const partner=(await db.query('select id from premium_partners')).rows[0].id;
  const batch='30000000-0000-4000-8000-000000000001',row='30000000-0000-4000-8000-000000000002';
  await db.query(`insert into premium_import_batches(id,partner_id,reference,created_by,plan_id,duration_days) values($1,$2,'TEST-BATCH',$3,$4,30)`,[batch,partner,actor,plans.completo.id]);
  await db.query(`insert into premium_import_rows(id,batch_id,row_number,name,email,normalized_email,status) values($1,$2,2,'User','user@example.invalid','user@example.invalid','PENDING_REGISTRATION')`,[row,batch]);
  await db.query(`insert into premium_pending_benefits(email,normalized_email,name,partner_id,plan_id,duration_days,import_batch_id,import_row_id) values('user@example.invalid','user@example.invalid','User',$1,$2,30,$3,$4)`,[partner,plans.completo.id,batch,row]);
  await db.exec('savepoint invalid_email');
  await assert.rejects(db.query("select premium_activate_pending($1,'user@example.invalid')",[other]),/email mismatch/);
  await db.exec('rollback to savepoint invalid_email');
  assert.equal((await db.query("select premium_activate_pending($1,'user@example.invalid') n",[user])).rows[0].n,1);
  assert.equal((await db.query("select premium_activate_pending($1,'user@example.invalid') n",[user])).rows[0].n,0);
  assert.equal((await db.query('select status from premium_pending_benefits')).rows[0].status,'ACTIVATED');
}));
