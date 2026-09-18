const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ler = arquivo => fs.readFileSync(path.resolve(__dirname, '..', arquivo), 'utf8');
const migration = ler('supabase/migrations/20260918100000_kits_voucher_estoque_entregas_central.sql');
const page = ler('app/admin/entregas/page.tsx');
const loja = ler('app/page.tsx');

test('voucher confirmado operacionalmente reserva estoque sem fingir pagamento', () => {
  assert.match(migration, /PAGAMENTO_NA_ENTREGA/);
  assert.match(migration, /reservar_estoque_entrega_voucher/);
  assert.match(migration, /estoque - estoque_reservado >= v_item\.quantidade/);
  assert.match(migration, /new\.pagamento_status := coalesce\(new\.pagamento_status, 'pending'\)/);
});
test('checkout e banco validam sabores do kit antes do pagamento', () => {
  assert.match(loja, /validarEstoqueEscolhaPlano/);
  assert.match(loja, /idsSaboresKit/);
  assert.match(migration, /Estoque disponível insuficiente/);
});
test('gerenciador central oferece lista, calendario, filtros, cobranca e acoes auditaveis', () => {
  for (const trecho of ['Gerenciador de Entregas', 'Calendário', 'Atrasadas', 'Cobrar na entrega', 'gerenciar_entrega_admin', 'Confirmar via admin', 'Somente atrasadas']) assert.match(page, new RegExp(trecho, 'i'));
  assert.match(migration, /acao_admin_/);
});
