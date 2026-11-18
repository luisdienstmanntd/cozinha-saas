import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { localSupabase, checked } from '../../scripts/local-supabase.mjs';
import {
  EXPECTED_ROLES,
  ORGANIZATION_NAMES,
  UNIT_NAMES,
  WRITE_TABLES,
  attemptRow,
  deniedAttempts,
  runValidation,
} from '../../scripts/hosted/validate-isolation.mjs';

// Fatia 8.4d: o script de validação do hospedado roda aqui, inteiro, contra o Supabase LOCAL descartável
// (único destino alternativo permitido, só por esta via de teste), com os mesmos dados fictícios que o
// procedimento cria no hospedado. Assim o script é provado antes de tocar no ambiente de testes real.
const ORIGIN = 'http://127.0.0.1:54321';

function psql(sql) {
  const container = execFileSync(
    'docker',
    ['ps', '--filter', 'name=supabase_db_', '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')[0];
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
    ],
    { input: sql, encoding: 'utf8' },
  );
}

// Dados fictícios iguais aos do ambiente de testes: empresas A e B, uma unidade cada, proprietários A e B,
// colaborador de A, um produto e um fornecedor por empresa. `overrides.roles`/`overrides.orgOf` permitem
// montar de propósito uma configuração errada.
async function seed(overrides = {}) {
  const { admin, publishableKey } = localSupabase();
  const orgs = { A: randomUUID(), B: randomUUID() };
  const ests = { A: randomUUID(), B: randomUUID() };
  const password = randomUUID();
  const users = {};
  const accounts = {};
  const roles = { ...EXPECTED_ROLES, ...overrides.roles };
  const orgOf = { A: 'A', B: 'B', C: 'A', ...overrides.orgOf };
  for (const label of ['A', 'B', 'C']) {
    const email = `valida-${label}-${randomUUID()}@example.invalid`;
    const { user } = checked(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    users[label] = user.id;
    accounts[label] = { email, password };
  }
  checked(
    await admin.from('organizations').insert([
      { id: orgs.A, name: ORGANIZATION_NAMES.A },
      { id: orgs.B, name: ORGANIZATION_NAMES.B },
    ]),
  );
  checked(
    await admin.from('establishments').insert(
      ['A', 'B'].map((k) => ({
        id: ests[k],
        organization_id: orgs[k],
        name: UNIT_NAMES[k],
        timezone: 'America/Sao_Paulo',
      })),
    ),
  );
  checked(
    await admin.from('memberships').insert(
      ['A', 'B', 'C'].map((label) => ({
        user_id: users[label],
        organization_id: orgs[orgOf[label]],
        role: roles[label],
      })),
    ),
  );
  const products = {};
  const suppliers = {};
  for (const k of ['A', 'B']) {
    products[k] = checked(
      await admin
        .from('products')
        .insert({
          organization_id: orgs[k],
          establishment_id: ests[k],
          name: `ZZ Produto ${k}`,
          unit: 'kg',
        })
        .select('id')
        .single(),
    ).id;
    suppliers[k] = checked(
      await admin
        .from('suppliers')
        .insert({
          organization_id: orgs[k],
          establishment_id: ests[k],
          name: `ZZ Fornecedor ${k}`,
        })
        .select('id')
        .single(),
    ).id;
  }
  const cleanup = async () => {
    for (const table of ['products', 'suppliers', 'memberships'])
      await admin
        .from(table)
        .delete()
        .in('organization_id', Object.values(orgs));
    await admin
      .from('establishments')
      .delete()
      .in('organization_id', Object.values(orgs));
    await admin.from('organizations').delete().in('id', Object.values(orgs));
    for (const id of Object.values(users))
      await admin.auth.admin.deleteUser(id);
  };
  return {
    admin,
    publishableKey,
    orgs,
    ests,
    users,
    accounts,
    products,
    suppliers,
    cleanup,
  };
}

const failures = (report) =>
  report.lines.filter((line) => line.startsWith('FALHA'));

test('validate-isolation: todas as verificações passam e nada é gravado', async () => {
  const s = await seed();
  try {
    const report = await runValidation({
      publishableKey: s.publishableKey,
      accounts: s.accounts,
      testOrigin: ORIGIN,
    });
    assert.deepEqual(failures(report), [], report.lines.join('\n'));
    assert.ok(report.lines.filter((l) => l.startsWith('OK')).length >= 15);
    // todas as 21 tabelas foram testadas sem login
    assert.ok(report.lines.some((l) => /nenhuma das 21 tabelas/.test(l)));
    // limitação conhecida: tabelas operacionais vazias são avisadas, não tratadas como prova
    assert.ok(
      report.lines.some(
        (l) => l.startsWith('AVISO') && l.includes('batch_receipts'),
      ),
    );
    assert.ok(!report.stopped);
  } finally {
    await s.cleanup();
  }
});

// Sensibilidade: configuração errada aborta ANTES de qualquer tentativa (sem nenhuma linha de escrita).
for (const [title, overrides, expected] of [
  [
    'colaborador vinculado à empresa errada',
    { orgOf: { C: 'B' } },
    /empresa fictícia esperada|unidade fictícia esperada/,
  ],
  [
    'colaborador com papel de proprietário',
    { roles: { C: 'owner' } },
    /vínculo ativo esperado \(papel member\)/,
  ],
  [
    'proprietário B com papel de colaborador',
    { roles: { B: 'member' } },
    /vínculo ativo esperado \(papel owner\)/,
  ],
]) {
  test(`validate-isolation: aborta sem tentar nada se há ${title}`, async () => {
    const s = await seed(overrides);
    try {
      const report = await runValidation({
        publishableKey: s.publishableKey,
        accounts: s.accounts,
        testOrigin: ORIGIN,
      });
      assert.equal(report.aborted, true);
      assert.ok(report.failures >= 1);
      assert.match(report.lines.join('\n'), expected);
      assert.match(report.lines.join('\n'), /Nada foi tentado/);
      assert.equal(
        report.lines.filter((l) => /recusad|acesso negado|sem login/.test(l))
          .length,
        0,
        'nenhuma tentativa pode ter sido feita',
      );
    } finally {
      await s.cleanup();
    }
  });
}

test('validate-isolation: acusa alteração de conteúdo mesmo com a mesma contagem de linhas', async () => {
  const s = await seed();
  try {
    const report = await runValidation({
      publishableKey: s.publishableKey,
      accounts: s.accounts,
      testOrigin: ORIGIN,
      // estranho de propósito: troca um nome e uma linha por outra, sem mudar nenhuma contagem
      betweenSnapshots: async () => {
        // service_role não tem UPDATE nessas tabelas: a alteração é feita direto no banco local
        psql(`
          update public.products set name = 'ZZ Produto alterado' where id = '${s.products.A}';
          update public.suppliers set name = 'ZZ Fornecedor alterado' where id = '${s.suppliers.B}';
        `);
      },
    });
    const bad = failures(report).join('\n');
    assert.match(bad, /nada foi gravado/);
    assert.match(bad, /A:products \(conteúdo\)/);
    assert.match(bad, /C:products \(conteúdo\)/);
    assert.match(bad, /B:suppliers \(conteúdo\)/);
    assert.doesNotMatch(bad, /\(contagem\)/);
  } finally {
    await s.cleanup();
  }
});

test('validate-isolation: exceção no meio encerra as sessões e não vaza segredos', async () => {
  const s = await seed();
  let token;
  try {
    const secret = s.accounts.A;
    await assert.rejects(
      runValidation({
        publishableKey: s.publishableKey,
        accounts: s.accounts,
        testOrigin: ORIGIN,
        betweenSnapshots: async ({ who }) => {
          token = who.A.token;
          throw new Error(
            `queda: ${secret.password} ${secret.email} ${token} ${s.publishableKey}`,
          );
        },
      }),
      (error) => {
        for (const forbidden of [
          secret.password,
          secret.email,
          token,
          s.publishableKey,
        ])
          assert.ok(!error.message.includes(forbidden), 'segredo no erro');
        assert.equal(error.cause, undefined);
        return true;
      },
    );
    // a sessão aberta pelo script foi encerrada no finally: o token copiado já não vale
    const response = await globalThis.fetch(
      `${ORIGIN}/rest/v1/organizations?select=id`,
      {
        headers: { apikey: s.publishableKey, Authorization: `Bearer ${token}` },
      },
    );
    assert.equal(response.status, 401);
  } finally {
    await s.cleanup();
  }
});

test('validate-isolation: gancho de teste é recusado fora do Supabase local', async () => {
  await assert.rejects(
    runValidation({
      publishableKey: 'sb_publishable_exemplo_sem_segredo',
      accounts: { A: {}, B: {}, C: {} },
      betweenSnapshots: async () => {},
    }),
    /Gancho de teste proibido/,
  );
});

// Se um acesso indevido der certo (aqui provocado de propósito com uma política aberta no banco LOCAL
// descartável), as escritas seguintes NÃO rodam e o conteúdo alterado é acusado.
test('validate-isolation: interrompe na hora diante de escrita indevida bem-sucedida', async () => {
  const s = await seed();
  try {
    // Política estreita (só as duas empresas deste teste) e SEM mexer em privilégios: os outros testes de
    // integração rodam em paralelo no mesmo banco e não podem ser afetados.
    psql(`
      create policy zz_validacao_aberta on public.suppliers for insert to authenticated
        with check (organization_id in ('${s.orgs.A}', '${s.orgs.B}'));
    `);
    const report = await runValidation({
      publishableKey: s.publishableKey,
      accounts: s.accounts,
      testOrigin: ORIGIN,
    });
    const text = report.lines.join('\n');
    assert.equal(report.stopped, true);
    assert.match(
      failures(report).join('\n'),
      /colaborador: escrita direta na própria empresa: tentativa não foi recusada por permissão — inserir suppliers: accepted/,
    );
    assert.match(text, /INTERROMPIDO os testes de escrita seguintes/);
    // nada depois da interrupção foi executado
    assert.doesNotMatch(text, /sem login: nenhuma/);
    assert.match(text, /PULOU testes de sessão e token/);
    assert.match(text, /nada foi gravado[^\n]*suppliers \(contagem\)/);
  } finally {
    psql(`
      drop policy if exists zz_validacao_aberta on public.suppliers;
      delete from public.suppliers where name = 'ZZ validação';
    `);
    await s.cleanup();
  }
});

// As linhas e chamadas usadas nas tentativas são VÁLIDAS: executadas com a autoridade certa (por quem tem
// permissão) dentro de uma transação que é desfeita, elas funcionam. Assim, uma recusa 42501 só pode vir da
// permissão e nunca de erro de formato ou de referência inexistente.
const literal = (value) => {
  if (value === null) return 'null';
  if (value === 'BATCH_PLACEHOLDER') return ":'batch'";
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
};

test('validate-isolation: as linhas de tentativa são válidas (executam com a autoridade certa e são desfeitas)', async () => {
  const s = await seed();
  try {
    // 1) escrita direta: papel dono das tabelas (sem RLS), em transação desfeita
    const owner = { org: s.orgs.B, est: s.ests.B, actor: s.users.A };
    const statements = [];
    for (const table of WRITE_TABLES) {
      const row = attemptRow(table, {
        ...owner,
        refs: {
          product: s.products.B,
          supplier: s.suppliers.B,
          batch: 'BATCH_PLACEHOLDER',
        },
      });
      const keys = Object.keys(row);
      const columns = keys.join(', ');
      const values = keys.map((k) => `${literal(row[k])}`).join(', ');
      const insert = `insert into public.${table} (${columns}) values (${values})`;
      if (table === 'batch_receipts')
        statements.push(`${insert} returning id as batch \\gset`);
      else statements.push(`${insert};`);
    }
    // Nas tabelas com privilégio por coluna, toda coluna da tentativa tem de estar concedida: assim a recusa
    // vem da RLS e não de "permissão negada na coluna".
    for (const [table, row] of [
      ['establishments', attemptRow('establishments', owner)],
      ['products', attemptRow('products', owner)],
      ['suppliers', attemptRow('suppliers', owner)],
    ])
      for (const column of Object.keys(row))
        assert.equal(
          psql(
            `select has_column_privilege('authenticated', 'public.${table}', '${column}', 'insert');`,
          ).trim(),
          't',
          `${table}.${column}`,
        );
    const direct = psql(`
      set session_replication_role = default;
      begin;
      ${statements.join('\n')}
      rollback;
    `);
    assert.ok(typeof direct === 'string');

    // 2) funções: como proprietário A, na própria empresa, com referências reais
    const calls = deniedAttempts({
      org: s.orgs.A,
      est: s.ests.A,
      other: s.users.C,
      refs: {
        product: s.products.A,
        supplier: s.suppliers.A,
        batch: 'BATCH_PLACEHOLDER',
      },
    });
    const sql = calls
      .map(([name, args]) => {
        const named = Object.entries(args)
          .map(([k, v]) => `${k} => ${literal(v)}`)
          .join(', ');
        return name === 'receive_batch'
          ? `select public.${name}(${named}) as batch \\gset`
          : `select public.${name}(${named});`;
      })
      .join('\n');
    const claims = JSON.stringify({ sub: s.users.A, role: 'authenticated' });
    psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claims', '${claims}', true);
      select set_config('request.jwt.claim.sub', '${s.users.A}', true);
      ${sql}
      rollback;
    `);
    // nada ficou: a transação foi desfeita
    const { count } = await s.admin
      .from('batch_receipts')
      .select('*', { count: 'exact', head: true })
      .in('organization_id', Object.values(s.orgs));
    assert.equal(count, 0);
  } finally {
    await s.cleanup();
  }
});
