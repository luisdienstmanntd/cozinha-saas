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
