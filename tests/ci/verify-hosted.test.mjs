import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyProject } from '../../scripts/hosted/verify-hosted.mjs';

const KEY = 'sb_publishable_exemplo_sem_segredo';
const URL_ = 'https://abcdefghij0123456789.supabase.co';

function fakeFetch({
  settings,
  tableStatus = 401,
  tableBody = '{"message":"permission denied"}',
}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, method: options?.method ?? 'GET' });
    if (url.endsWith('/auth/v1/settings'))
      return { ok: true, status: 200, json: async () => settings };
    return {
      ok: tableStatus === 200,
      status: tableStatus,
      text: async () => tableBody,
    };
  };
  return { impl, calls };
}
const good = {
  disable_signup: true,
  mailer_autoconfirm: false,
  external: { email: true, anonymous_users: false, google: false },
};

test('projeto bem configurado passa sem falhas', async () => {
  const { impl, calls } = fakeFetch({ settings: good });
  const results = await verifyProject({
    url: URL_,
    publishableKey: KEY,
    fetchImpl: impl,
  });
  assert.equal(results.filter((r) => r.status === 'FALHA').length, 0);
  assert.ok(
    calls.every((c) => c.method === 'GET'),
    'só leitura',
  );
  assert.ok(
    calls.every((c) => !c.url.includes('/signup')),
    'nunca tenta cadastrar',
  );
});

test('cadastro público ligado é falha', async () => {
  const { impl } = fakeFetch({ settings: { ...good, disable_signup: false } });
  const results = await verifyProject({
    url: URL_,
    publishableKey: KEY,
    fetchImpl: impl,
  });
  assert.equal(
    results.find((r) => r.name === 'cadastro público desligado').status,
    'FALHA',
  );
});

test('login anônimo ligado é falha; desconhecido é aviso', async () => {
  const on = fakeFetch({
    settings: { ...good, external: { anonymous_users: true } },
  });
  assert.equal(
    (
      await verifyProject({
        url: URL_,
        publishableKey: KEY,
        fetchImpl: on.impl,
      })
    ).find((r) => r.name === 'login anônimo desligado').status,
    'FALHA',
  );
  const unknown = fakeFetch({
    settings: { ...good, external: { email: true } },
  });
  assert.equal(
    (
      await verifyProject({
        url: URL_,
        publishableKey: KEY,
        fetchImpl: unknown.impl,
      })
    ).find((r) => r.name === 'login anônimo desligado').status,
    'AVISO',
  );
});

test('API anônima que devolve linhas é falha', async () => {
  const { impl } = fakeFetch({
    settings: good,
    tableStatus: 200,
    tableBody: '[{"id":"1"}]',
  });
  const results = await verifyProject({
    url: URL_,
    publishableKey: KEY,
    fetchImpl: impl,
  });
  assert.ok(
    results.some(
      (r) => r.name.startsWith('API anônima') && r.status === 'FALHA',
    ),
  );
});

test('a saída não contém a chave', async () => {
  const { impl } = fakeFetch({ settings: good });
  const results = await verifyProject({
    url: URL_,
    publishableKey: KEY,
    fetchImpl: impl,
  });
  assert.ok(!JSON.stringify(results).includes(KEY));
});
