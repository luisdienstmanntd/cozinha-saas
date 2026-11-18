import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import {
  ALLOWED_PROJECT_REF,
  TABLES,
  WRITE_TABLES,
  accountProblems,
  assertTarget,
  attemptRow,
  classifyWrite,
  deniedAttempts,
  digestRows,
  diffSnapshots,
  directWrites,
  expectedOrganization,
  hostedUrl,
  isDenied,
  rpcAttempts,
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

const part = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const makeToken = (signature) =>
  `${part({ alg: 'HS256' })}.${part({ sub: 'a', role: 'authenticated' })}.${signature.toString('base64url')}`;

test('tokens adulterados mudam de verdade os bytes (assinatura, usuário e algoritmo)', () => {
  // vários tamanhos (HS256 = 32 bytes, ES256 = 64) e muitas assinaturas, inclusive as que terminam em "A"
  for (const size of [32, 64])
    for (let i = 0; i < 200; i += 1) {
      const signature = randomBytes(size);
      const token = makeToken(signature);
      const changed = tamperToken(token, 'signature');
      assert.equal(changed.split('.').length, 3);
      assert.notEqual(changed, token);
      assert.notEqual(
        Buffer.compare(
          signature,
          Buffer.from(changed.split('.')[2], 'base64url'),
        ),
        0,
        'os bytes da assinatura precisam ter mudado',
      );
    }
  const token = makeToken(randomBytes(32));
  assert.equal(tamperToken(token, 'none').split('.')[2], '');
  const header = JSON.parse(
    Buffer.from(tamperToken(token, 'none').split('.')[0], 'base64url'),
  );
  assert.equal(header.alg, 'none');
  const subject = JSON.parse(
    Buffer.from(tamperToken(token, 'subject').split('.')[1], 'base64url'),
  );
  assert.notEqual(subject.sub, 'a');
  assert.throws(() => tamperToken(token, 'outro'));
  assert.throws(() => tamperToken(makeToken(Buffer.alloc(0)), 'signature'));
});

test('trocar só o último caractere da assinatura não muda bytes: o script não faz isso', () => {
  // demonstra o defeito corrigido: 'A' e 'B' no fim de uma assinatura de 32 bytes decodificam igual
  const signature = Buffer.alloc(32, 7);
  signature[31] = 0;
  const text = signature.toString('base64url');
  assert.equal(text.slice(-1), 'A');
  assert.equal(
    Buffer.compare(
      signature,
      Buffer.from(`${text.slice(0, -1)}B`, 'base64url'),
    ),
    0,
  );
  const source = readFileSync('scripts/hosted/validate-isolation.mjs', 'utf8');
  assert.doesNotMatch(source, /signature\.slice\(-1\)/);
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

const snap = (rows) => ({ t: digestRows(rows) });

test('a fotografia de conteúdo acusa alteração mesmo com a mesma contagem', () => {
  const base = [
    { id: 1, name: 'ZZ Produto A', unit: 'kg' },
    { id: 2, name: 'ZZ Produto B', unit: 'kg' },
  ];
  assert.deepEqual(diffSnapshots(snap(base), snap([...base])), []);
  // mesma contagem, uma coluna alterada
  const edited = [{ ...base[0], name: 'outro nome' }, base[1]];
  assert.equal(digestRows(edited).count, digestRows(base).count);
  assert.deepEqual(diffSnapshots(snap(base), snap(edited)), ['t (conteúdo)']);
  // mesma contagem, uma linha apagada e outra inserida
  const swapped = [base[0], { id: 3, name: 'ZZ Produto C', unit: 'kg' }];
  assert.deepEqual(diffSnapshots(snap(base), snap(swapped)), ['t (conteúdo)']);
  // contagem diferente
  assert.deepEqual(diffSnapshots(snap(base), snap([base[0]])), [
    't (contagem)',
  ]);
  // erro de leitura que aparece ou some também é mudança
  assert.deepEqual(diffSnapshots(snap(base), { t: { error: 'erro:42501' } }), [
    't (leitura)',
  ]);
});

test('o resumo não depende da ordem das linhas nem da ordem das colunas', () => {
  const a = [
    { id: 1, x: 'a', y: null },
    { id: 2, x: 'b', y: 3 },
  ];
  const b = [
    { y: 3, x: 'b', id: 2 },
    { y: null, id: 1, x: 'a' },
  ];
  assert.deepEqual(digestRows(a), digestRows(b));
  assert.notDeepEqual(digestRows(a), digestRows([]));
});

test('só acesso negado (42501) vale como recusa de escrita; sucesso e erros de formato não', () => {
  assert.equal(
    classifyWrite({ data: null, error: { code: '42501' }, status: 403 }),
    'denied',
  );
  // inserir com sucesso, mesmo sem linhas devolvidas, é acesso indevido
  assert.equal(
    classifyWrite({ data: [], error: null, status: 201 }),
    'accepted',
  );
  // alterar/excluir: só "zero linhas afetadas" confirmado pelo servidor vale como recusa silenciosa da RLS
  const silently = { zeroRowsIsDenied: true };
  assert.equal(
    classifyWrite({ data: [], count: 0, error: null }, silently),
    'denied',
  );
  assert.equal(
    classifyWrite({ data: [], count: 2, error: null }, silently),
    'accepted',
  );
  assert.equal(classifyWrite({ data: [], error: null }, silently), 'accepted');
  assert.equal(classifyWrite({ data: [], count: 0, error: null }), 'accepted');
  assert.equal(classifyWrite({ data: [{ id: 1 }], error: null }), 'accepted');
  for (const code of [
    'PGRST204',
    '22P02',
    '23503',
    '23502',
    'PGRST202',
    '42703',
  ])
    assert.equal(
      classifyWrite({ data: null, error: { code } }),
      'inconclusive',
    );
  // 401/403 sem o código de permissão não bastam
  assert.equal(
    classifyWrite({ data: null, error: { code: 'PGRST301' }, status: 401 }),
    'inconclusive',
  );
});

function fakeClient(script) {
  const calls = [];
  const finish = (key) => ({
    select: async () => {
      calls.push(key);
      return script(key);
    },
  });
  return {
    calls,
    from: (table) => ({
      insert: () => finish(`inserir ${table}`),
      update: () => ({ eq: () => finish(`alterar ${table}`) }),
      delete: () => ({ eq: () => finish(`excluir ${table}`) }),
    }),
    rpc: async (name) => {
      calls.push(`rpc ${name}`);
      return script(`rpc ${name}`);
    },
  };
}
const denied = { data: null, error: { code: '42501' }, status: 403 };
const ctx = {
  org: 'o',
  est: 'e',
  actor: 'u',
  other: 'v',
  refs: { product: 'p', supplier: 's', batch: 'b' },
};

test('as tentativas de escrita param no primeiro resultado que não seja acesso negado', async () => {
  const all = fakeClient(() => denied);
  assert.equal(await directWrites(all, 'products', ctx), null);
  assert.deepEqual(all.calls, [
    'inserir products',
    'alterar products',
    'excluir products',
  ]);
  // inserir é aceito: nada de alterar nem excluir depois
  const accepted = fakeClient((key) =>
    key === 'inserir products' ? { data: [{ id: 1 }], error: null } : denied,
  );
  assert.match(
    await directWrites(accepted, 'products', ctx),
    /inserir products: accepted/,
  );
  assert.deepEqual(accepted.calls, ['inserir products']);
  // alterar sem erro e SEM contagem de linhas afetadas não prova recusa; com linhas afetadas, é falha
  const silent = fakeClient((key) =>
    key === 'alterar products'
      ? { data: [{ id: 1 }], count: 1, error: null }
      : denied,
  );
  assert.match(
    await directWrites(silent, 'products', ctx),
    /alterar products: accepted/,
  );
  assert.ok(!silent.calls.includes('excluir products'));
  // recusa silenciosa da RLS (0 linhas afetadas): vale, e fica registrada se a tabela alvo está vazia
  const vacuous = [];
  const rls = fakeClient((key) =>
    key.startsWith('inserir') ? denied : { data: [], count: 0, error: null },
  );
  assert.equal(
    await directWrites(rls, 'products', {
      ...ctx,
      targetRows: { products: 0 },
      vacuous,
    }),
    null,
  );
  assert.deepEqual(vacuous, ['alterar products', 'excluir products']);
  // erro de formato não é recusa: interrompe como inconclusivo
  const format = fakeClient(() => ({ data: null, error: { code: '23502' } }));
  assert.match(await directWrites(format, 'products', ctx), /inconclusive/);
  // funções: a primeira não negada interrompe as demais
  const rpc = fakeClient((key) =>
    key === 'rpc record_movement' ? { data: 'x', error: null } : denied,
  );
  assert.match(await rpcAttempts(rpc, ctx), /record_movement: accepted/);
  assert.deepEqual(rpc.calls, ['rpc receive_batch', 'rpc record_movement']);
});

test('as tentativas usam linhas completas e referências reais, sem identificadores inventados para o que existe', () => {
  const full = {
    ...ctx,
    org: 'ORG-ALVO',
    est: 'EST-ALVO',
    actor: 'QUEM-TENTA',
    refs: { product: 'PROD-REAL', supplier: 'FORN-REAL', batch: 'LOTE-REAL' },
  };
  for (const table of WRITE_TABLES) {
    const row = attemptRow(table, full);
    if (table !== 'organizations')
      assert.equal(row.organization_id, 'ORG-ALVO', table);
    if (!['organizations', 'establishments', 'memberships'].includes(table))
      assert.equal(row.establishment_id, 'EST-ALVO', table);
  }
  assert.equal(attemptRow('memberships', full).user_id, 'QUEM-TENTA');
  assert.equal(attemptRow('memberships', full).role, 'owner');
  const receipt = attemptRow('batch_receipts', full);
  assert.equal(receipt.product_id, 'PROD-REAL');
  assert.equal(receipt.supplier_id, 'FORN-REAL');
  for (const column of [
    'quantity',
    'unit',
    'expiry_date',
    'expiry_origin',
    'timezone',
    'created_by',
    'source_code',
    'intent_id',
  ])
    assert.ok(receipt[column] !== undefined, column);
  assert.equal(attemptRow('stock_movements', full).batch_id, 'LOTE-REAL');
  const calls = Object.fromEntries(deniedAttempts(full));
  assert.equal(calls.receive_batch.p_product_id, 'PROD-REAL');
  assert.equal(calls.record_movement.p_batch_id, 'LOTE-REAL');
  assert.equal(calls.set_member_display_name.p_user_id, 'v');
  assert.throws(() => attemptRow('containers', full));
});

test('papéis, vínculos e unidades das contas são conferidos antes de qualquer tentativa', () => {
  const good = (label) => ({
    label,
    userId: 'u1',
    organizations: [
      { id: 'o1', name: label === 'B' ? 'CozziGo Teste B' : 'CozziGo Teste A' },
    ],
    establishments: [
      {
        id: 'e1',
        organization_id: 'o1',
        name: label === 'B' ? 'Unidade Teste B' : 'Unidade Teste A',
      },
    ],
    memberships: [
      {
        organization_id: 'o1',
        user_id: 'u1',
        role: label === 'C' ? 'member' : 'owner',
        revoked_at: null,
      },
    ],
  });
  for (const label of ['A', 'B', 'C'])
    assert.deepEqual(accountProblems(good(label)), []);
  const mutate = (label, change) =>
    accountProblems({ ...good(label), ...change });
  // papel trocado (colaborador como proprietário e vice-versa)
  assert.equal(
    mutate('C', {
      memberships: [{ ...good('C').memberships[0], role: 'owner' }],
    }).length,
    1,
  );
  assert.equal(
    mutate('A', {
      memberships: [{ ...good('A').memberships[0], role: 'member' }],
    }).length,
    1,
  );
  // vínculo revogado, vínculo ausente, vínculo de outra empresa visível
  assert.equal(
    mutate('A', {
      memberships: [{ ...good('A').memberships[0], revoked_at: '2026-01-01' }],
    }).length,
    1,
  );
  assert.ok(mutate('A', { memberships: [] }).length >= 1);
  assert.ok(
    mutate('A', {
      memberships: [
        ...good('A').memberships,
        {
          organization_id: 'o2',
          user_id: 'u9',
          role: 'owner',
          revoked_at: null,
        },
      ],
    }).length >= 1,
  );
  // unidade ausente, extra, com outro nome ou de outra empresa
  assert.ok(mutate('A', { establishments: [] }).length >= 1);
  assert.ok(
    mutate('A', {
      establishments: [
        ...good('A').establishments,
        { id: 'e2', organization_id: 'o1', name: 'Unidade Teste A' },
      ],
    }).length >= 1,
  );
  assert.ok(
    mutate('B', {
      establishments: [
        { ...good('B').establishments[0], name: 'Unidade Real' },
      ],
    }).length >= 1,
  );
  assert.ok(
    mutate('A', {
      establishments: [
        { ...good('A').establishments[0], organization_id: 'o9' },
      ],
    }).length >= 1,
  );
  // empresa real no lugar da fictícia
  assert.ok(
    mutate('A', { organizations: [{ id: 'o1', name: 'Restaurante Real' }] })
      .length >= 1,
  );
});

test('o código encerra sessões em finally, com logout local, e não lê segredos do ambiente', () => {
  const source = readFileSync('scripts/hosted/validate-isolation.mjs', 'utf8');
  assert.match(source, /finally \{[\s\S]*signOut\(\{ scope: 'local' \}\)/);
  assert.doesNotMatch(source, /signOut\(\)/);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /signOut\(\{ scope: 'global'/);
  assert.match(source, /unhandledRejection/);
  assert.match(source, /uncaughtException/);
  // a exceção original nunca é anexada como causa
  assert.doesNotMatch(source, /new Error\([^)]*\{ cause/);
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
