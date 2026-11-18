import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import {
  ALLOWED_PROJECT_REF,
  TABLES,
  assertTarget,
  diffSnapshots,
  expectedOrganization,
  hostedUrl,
  isDenied,
  scrub,
  tamperToken,
} from '../../scripts/hosted/validate-isolation.mjs';

const KEY = 'sb_publishable_exemplo_sem_segredo';

test('o destino é fixo e só aceita chave publicável', () => {
  assert.equal(hostedUrl(), `https://${ALLOWED_PROJECT_REF}.supabase.co`);
  assert.equal(assertTarget({ publishableKey: KEY }), hostedUrl());
  for (const bad of [
    'sb_secret_exemplo_sem_segredo_nenhum',
    'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura',
    'sb_publishable_c',
    'sb_publishable_secret_exemplo_longo_demais_x',
    '',
    undefined,
  ])
    assert.throws(() => assertTarget({ publishableKey: bad }));
});

test('só o Supabase local descartável é aceito como destino alternativo, e só por teste', () => {
  assert.equal(
    assertTarget({ publishableKey: KEY, testOrigin: 'http://127.0.0.1:54321' }),
    'http://127.0.0.1:54321',
  );
  for (const origin of [
    'https://outro.supabase.co',
    'http://127.0.0.1:9999',
    'https://example.com',
  ])
    assert.throws(() =>
      assertTarget({ publishableKey: KEY, testOrigin: origin }),
    );
});

test('a linha de comando não tem como trocar o endereço', () => {
  const source = readFileSync('scripts/hosted/validate-isolation.mjs', 'utf8');
  assert.doesNotMatch(source, /process\.env\.VALIDATE_SUPABASE_URL/);
  assert.doesNotMatch(source, /process\.argv[^\n]*(url|origin)/i);
  assert.match(source, /const url = testOrigin \?\? hostedUrl\(\)/);
});

test('tokens adulterados nunca coincidem com o original', () => {
  const part = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${part({ alg: 'HS256' })}.${part({ sub: 'a', role: 'authenticated' })}.${'x'.repeat(20)}`;
  for (const mode of ['signature', 'subject', 'none']) {
    const changed = tamperToken(token, mode);
    assert.notEqual(changed, token);
    assert.equal(changed.split('.').length, 3);
  }
  assert.equal(tamperToken(token, 'none').split('.')[2], '');
  const subject = JSON.parse(
    Buffer.from(tamperToken(token, 'subject').split('.')[1], 'base64url'),
  );
  assert.notEqual(subject.sub, 'a');
  assert.throws(() => tamperToken(token, 'outro'));
});

test('a saída nunca carrega senha, token, chave ou e-mail', () => {
  const secrets = ['senha-super-secreta', 'pessoa@exemplo.com'];
  const jwt =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3OCJ9.assinaturaassinatura';
  const text = scrub(
    `falhou senha-super-secreta para pessoa@exemplo.com com ${jwt} e ${KEY} e outro@x.com`,
    secrets,
  );
  for (const forbidden of [
    'senha-super-secreta',
    'pessoa@exemplo.com',
    jwt,
    KEY,
    'outro@x.com',
  ])
    assert.ok(!text.includes(forbidden), forbidden);
  assert.ok(text.length <= 300);
});

test('a trava da empresa fictícia exige exatamente uma empresa com o nome esperado', () => {
  const row = { id: '1', name: 'CozziGo Teste A' };
  assert.equal(expectedOrganization([row], 'CozziGo Teste A'), true);
  assert.equal(expectedOrganization([row], 'CozziGo Teste B'), false);
  assert.equal(expectedOrganization([], 'CozziGo Teste A'), false);
  assert.equal(
    expectedOrganization([row, { ...row, id: '2' }], 'CozziGo Teste A'),
    false,
  );
  assert.equal(expectedOrganization(null, 'CozziGo Teste A'), false);
  assert.equal(
    expectedOrganization(
      [{ id: '1', name: 'Restaurante Real' }],
      'CozziGo Teste A',
    ),
    false,
  );
});

test('recusa é erro de permissão ou resultado vazio; linhas devolvidas nunca contam', () => {
  assert.equal(
    isDenied({ data: null, error: { code: '42501' }, status: 403 }),
    true,
  );
  assert.equal(
    isDenied({ data: null, error: { code: 'PGRST301' }, status: 401 }),
    true,
  );
  assert.equal(isDenied({ data: [], error: null, status: 200 }), true);
  assert.equal(
    isDenied({ data: [{ id: 1 }], error: null, status: 200 }),
    false,
  );
  assert.equal(
    isDenied({
      data: null,
      error: { code: 'PGRST204', message: 'coluna' },
      status: 400,
    }),
    false,
  );
});

test('a comparação de fotografias acusa qualquer linha a mais ou a menos', () => {
  assert.deepEqual(diffSnapshots({ a: 1, b: 2 }, { a: 1, b: 2 }), []);
  assert.deepEqual(diffSnapshots({ a: 1, b: 2 }, { a: 1, b: 3 }), ['b']);
});

test('a lista de tabelas confere com as migrações', () => {
  const created = new Set();
  for (const file of readdirSync('supabase/migrations')) {
    const text = readFileSync(`supabase/migrations/${file}`, 'utf8');
    for (const match of text.matchAll(
      /create table (?:if not exists )?public\.([a-z_]+)/g,
    ))
      created.add(match[1]);
  }
  assert.deepEqual([...created].sort(), [...TABLES].sort());
});
