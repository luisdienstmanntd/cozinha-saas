import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localSupabase, checked } from '../../scripts/local-supabase.mjs';
import {
  ORGANIZATION_NAMES,
  runValidation,
} from '../../scripts/hosted/validate-isolation.mjs';

// Fatia 8.4d: o script de validação do hospedado roda aqui, inteiro, contra o Supabase LOCAL descartável
// (único destino alternativo permitido, só por esta via de teste), com os mesmos dados fictícios que o
// procedimento cria no hospedado. Assim o script é provado antes de tocar no ambiente de testes real.
test('validate-isolation: todas as verificações passam e nada é gravado', async () => {
  const { admin, publishableKey } = localSupabase();
  const orgs = { A: randomUUID(), B: randomUUID() };
  const ests = { A: randomUUID(), B: randomUUID() };
  const password = randomUUID();
  const users = [];
  const accounts = {};
  try {
    for (const [label, role, org] of [
      ['A', 'owner', 'A'],
      ['B', 'owner', 'B'],
      ['C', 'member', 'A'],
    ]) {
      const email = `valida-${label}-${randomUUID()}@example.invalid`;
      const { user } = checked(
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        }),
      );
      users.push({ id: user.id, org: orgs[org], role });
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
          name: `Unidade ${k}`,
          timezone: 'America/Sao_Paulo',
        })),
      ),
    );
    checked(
      await admin.from('memberships').insert(
        users.map((u) => ({
          user_id: u.id,
          organization_id: u.org,
          role: u.role,
        })),
      ),
    );
    for (const k of ['A', 'B']) {
      checked(
        await admin.from('products').insert({
          organization_id: orgs[k],
          establishment_id: ests[k],
          name: `ZZ Produto ${k}`,
          unit: 'kg',
        }),
      );
      checked(
        await admin.from('suppliers').insert({
          organization_id: orgs[k],
          establishment_id: ests[k],
          name: `ZZ Fornecedor ${k}`,
        }),
      );
    }
    const report = await runValidation({
      publishableKey,
      accounts,
      testOrigin: 'http://127.0.0.1:54321',
    });
    const failures = report.lines.filter((line) => line.startsWith('FALHA'));
    assert.deepEqual(failures, [], report.lines.join('\n'));
    assert.ok(report.lines.filter((l) => l.startsWith('OK')).length >= 20);
  } finally {
    await admin
      .from('products')
      .delete()
      .in('organization_id', Object.values(orgs));
    await admin
      .from('suppliers')
      .delete()
      .in('organization_id', Object.values(orgs));
    await admin
      .from('memberships')
      .delete()
      .in('organization_id', Object.values(orgs));
    await admin
      .from('establishments')
      .delete()
      .in('organization_id', Object.values(orgs));
    await admin.from('organizations').delete().in('id', Object.values(orgs));
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
  }
});

// Sensibilidade: se uma conta passar a enxergar uma segunda empresa (vazamento ou conta errada), o script
// aborta antes de qualquer tentativa em vez de seguir.
test('validate-isolation: aborta se uma conta enxerga empresa que não deveria', async () => {
  const { admin, publishableKey } = localSupabase();
  const orgs = { A: randomUUID(), B: randomUUID() };
  const password = randomUUID();
  const users = [];
  const accounts = {};
  try {
    for (const [label, role, org] of [
      ['A', 'owner', 'A'],
      ['B', 'owner', 'B'],
      ['C', 'member', 'A'],
    ]) {
      const email = `valida-x-${label}-${randomUUID()}@example.invalid`;
      const { user } = checked(
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        }),
      );
      users.push({ id: user.id, org: orgs[org], role });
      accounts[label] = { email, password };
    }
    checked(
      await admin.from('organizations').insert([
        { id: orgs.A, name: ORGANIZATION_NAMES.A },
        { id: orgs.B, name: ORGANIZATION_NAMES.B },
      ]),
    );
    checked(
      await admin.from('memberships').insert(
        // conta errada de propósito: o "colaborador de A" pertence na verdade à empresa B
        users.map((u, i) => ({
          user_id: u.id,
          organization_id: i === 2 ? orgs.B : u.org,
          role: u.role,
        })),
      ),
    );
    await assert.rejects(
      runValidation({
        publishableKey,
        accounts,
        testOrigin: 'http://127.0.0.1:54321',
      }),
      /não vê exatamente a empresa fictícia esperada/,
    );
  } finally {
    await admin
      .from('memberships')
      .delete()
      .in('organization_id', Object.values(orgs));
    await admin.from('organizations').delete().in('id', Object.values(orgs));
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
  }
});
