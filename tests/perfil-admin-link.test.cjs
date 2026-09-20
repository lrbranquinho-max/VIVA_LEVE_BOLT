const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.resolve(__dirname, '../app/perfil/page.tsx'), 'utf8');

test('perfil identifica administrador e oferece acesso direto ao admin', () => {
  assert.match(page, /rpc\('is_viva_leve_admin'\)/);
  assert.match(page, /href="\/admin"/);
  assert.match(page, /Acessar área administrativa/);
});
