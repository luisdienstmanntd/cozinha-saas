// Fase 6, fatia 6.10: o script de provisionamento cria empresa, unidades, proprietário e membros com
// nome de exibição; as pessoas entram, o membro só lê e a outra empresa não vê nada; plano inválido não
// deixa nada; repetir o plano é recusado; as senhas não aparecem na saída do script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { checked, localSupabase } from '../../scripts/local-supabase.mjs';
import { provision } from '../../scripts/provision.mjs';

const plan = () => {
  const tag = randomUUID().slice(0, 8);
  return {
    organization: `Piloto ${tag}`,
    establishments: [
      { name: 'Cozinha principal', timezone: 'America/Sao_Paulo' },
      { name: 'Cozinha auxiliar', timezone: 'America/Sao_Paulo' },
    ],
    owner: { email: `dono-${tag}@example.test`, displayName: 'Ana' },
    members: [
      { email: `bia-${tag}@example.test`, displayName: 'Bia' },
      { email: `caio-${tag}@example.test`, displayName: 'Caio' },
    ],
  };
};

test('provisiona empresa piloto e as pessoas entram com o papel certo', async () => {
  const env = localSupabase();
  const input = plan();
  const result = await provision(env, input);
  assert.equal(result.establishments.length, 2);
  assert.equal(result.users.length, 3);
  const [owner, bia] = result.credentials;
  const a = env.client();
  const member = env.client();
  checked(
    await a.auth.signInWithPassword({
      email: owner.email,
      password: owner.temporaryPassword,
    }),
  );
  checked(
    await member.auth.signInWithPassword({
      email: bia.email,
      password: bia.temporaryPassword,
    }),
  );
  const memberships = checked(
    await env.admin
      .from('memberships')
      .select('role,display_name')
      .eq('organization_id', result.organizationId)
      .order('display_name'),
  );
  assert.deepEqual(
    memberships.map((m) => [m.display_name, m.role]),
    [
      ['Ana', 'owner'],
      ['Bia', 'member'],
      ['Caio', 'member'],
    ],
  );
  assert.equal(
    checked(
      await a
        .from('establishments')
        .select('id')
        .eq('organization_id', result.organizationId),
    ).length,
    2,
  );
  // Membro lê, mas não cria unidade nem define nome de ninguém.
  assert.equal(
    checked(
      await member
        .from('establishments')
        .select('id')
        .eq('organization_id', result.organizationId),
    ).length,
    2,
  );
  assert.ok(
    (
      await member.from('establishments').insert({
        organization_id: result.organizationId,
        name: 'X',
        timezone: 'UTC',
      })
    ).error,
    'membro não cria unidade',
  );
  assert.equal(
    (
      await member.rpc('set_member_display_name', {
        p_organization_id: result.organizationId,
        p_user_id: result.users[0].userId,
        p_display_name: 'Outro',
      })
    ).error?.code,
    '42501',
  );
  // O nome de exibição ficou auditado.
  const audit = checked(
    await env.admin
      .from('entity_changes')
      .select('id')
      .eq('organization_id', result.organizationId)
      .eq('field', 'display_name'),
  );
  assert.equal(audit.length, 3, 'os três nomes de exibição ficaram auditados');
  // Outra empresa não vê nada desta.
  const other = await provision(env, plan());
  const b = env.client();
  checked(
    await b.auth.signInWithPassword({
      email: other.credentials[0].email,
      password: other.credentials[0].temporaryPassword,
    }),
  );
  assert.equal(
    checked(
      await b
        .from('establishments')
        .select('id')
        .eq('organization_id', result.organizationId),
    ).length,
    0,
  );
  assert.equal(
    checked(
      await b
        .from('memberships')
        .select('id')
        .eq('organization_id', result.organizationId),
    ).length,
    0,
  );
  // Repetir o plano é recusado e não altera nada.
  await assert.rejects(() => provision(env, input), /Já existe uma empresa/);
  assert.equal(
    checked(
      await env.admin
        .from('memberships')
        .select('id')
        .eq('organization_id', result.organizationId),
    ).length,
    3,
  );
});

test('plano inválido é recusado e não deixa empresa nem usuário', async () => {
  const env = localSupabase();
  const bad = plan();
  bad.establishments[0].timezone = 'Marte/Olimpo';
  await assert.rejects(() => provision(env, bad));
  assert.deepEqual(
    checked(
      await env.admin
        .from('organizations')
        .select('id')
        .eq('name', bad.organization),
    ),
    [],
  );
  const dup = plan();
  dup.members[0].email = dup.owner.email.toUpperCase();
  await assert.rejects(() => provision(env, dup), /E-mails repetidos/);
  const noOwnerName = plan();
  noOwnerName.owner.displayName = '   ';
  await assert.rejects(() => provision(env, noOwnerName));
  assert.deepEqual(
    checked(
      await env.admin
        .from('organizations')
        .select('id')
        .eq('name', noOwnerName.organization),
    ),
    [],
  );
  const { data } = await env.admin.auth.admin.listUsers({ perPage: 1000 });
  assert.ok(
    !data.users.some((u) => u.email === bad.owner.email),
    'usuário do plano inválido não foi criado',
  );
});

test('CLI grava as senhas em arquivo 0600 e não as imprime', () => {
  const dir = mkdtempSync(join(tmpdir(), 'provision-'));
  const planPath = join(dir, 'plano.json');
  const outPath = join(dir, 'credenciais.json');
  writeFileSync(planPath, JSON.stringify(plan()));
  const run = () =>
    spawnSync(
      process.execPath,
      ['scripts/provision.mjs', planPath, '--credentials-out', outPath],
      { encoding: 'utf8' },
    );
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const credentials = JSON.parse(readFileSync(outPath, 'utf8'));
  assert.equal(credentials.length, 3);
  assert.equal(statSync(outPath).mode & 0o777, 0o600);
  for (const { temporaryPassword } of credentials)
    assert.ok(
      !first.stdout.includes(temporaryPassword) &&
        !first.stderr.includes(temporaryPassword),
      'senha não aparece na saída',
    );
  // Não sobrescreve credenciais existentes e recusa repetir.
  const second = run();
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /já existe/);
  const usage = spawnSync(process.execPath, ['scripts/provision.mjs'], {
    encoding: 'utf8',
  });
  assert.notEqual(usage.status, 0);
});
