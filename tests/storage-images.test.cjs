const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('cardapio usa variantes e nao consulta produtos com select estrela', () => {
  const store = read('app/page.tsx');
  const detail = read('app/produto/[id]/page.tsx');
  assert.match(store, /imagem_thumbnail_url/);
  assert.match(detail, /imagem_detalhe_url/);
  assert.doesNotMatch(store, /from\('produtos'\)[\s\S]{0,120}select\('\*'/);
  assert.doesNotMatch(detail, /from\('produtos'\)[\s\S]{0,120}select\('\*'/);
});

test('service worker prioriza CacheFirst para Storage oficial', () => {
  const config = read('next.config.js');
  assert.match(config, /kdhdtdwayqdbkxbbpawm/);
  assert.match(config, /handler: 'CacheFirst'/);
  assert.match(config, /maxAgeSeconds: 365 \* 24 \* 60 \* 60/);
});

test('uploads novos sao versionados, comprimidos e limitados a 3 MB', () => {
  const optimizer = read('lib/productImages.ts');
  assert.match(optimizer, /3 \* 1024 \* 1024/);
  assert.match(optimizer, /-thumb-480\.webp/);
  assert.match(optimizer, /-detail-1200\.webp/);
  assert.match(optimizer, /SHA-256/);
  assert.match(optimizer, /31536000/);
});

