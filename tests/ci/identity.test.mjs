import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('o título da aba usa o nome comercial CozziGo', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /<title>CozziGo<\/title>/);
});

test('as chaves internas do navegador não mudam com o nome comercial', () => {
  const identity = readFileSync(
    'src/features/identity/data/supabaseIdentity.ts',
    'utf8',
  );
  assert.match(identity, /cozinha-saas\.auth/);
});

test('a aba usa o ícone CozziGo em PNG e em ICO com três tamanhos', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /rel="icon"\s+href="%BASE_URL%favicon\.png"/);
  assert.match(html, /rel="icon"\s+href="%BASE_URL%favicon\.ico"/);
  const png = readFileSync('public/favicon.png');
  assert.equal(png.readUInt32BE(0), 0x89504e47);
  assert.equal(png.readUInt32BE(16), 32);
  assert.equal(png.readUInt32BE(20), 32);
  const ico = readFileSync('public/favicon.ico');
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  assert.deepEqual([ico[6], ico[22], ico[38]], [16, 32, 48]);
});
