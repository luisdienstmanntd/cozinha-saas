// D-077 (fatia B da auditoria do PR #79): gestão da equipe pela API real do Supabase local.
// 1) Fluxo completo pela API: vincular por e-mail, a pessoa entra, revogar corta a sessão aberta, restaurar.
// 2) Corrida: dois proprietários rebaixam um ao outro ao mesmo tempo; a empresa nunca fica sem dono.
// Dados sintéticos; o histórico é append-only, então os registros criados ficam no banco local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { localSupabase, checked } from '../../scripts/local-supabase.mjs';

test('proprietário vincula, revoga e restaura pela API; a revogação vale para a sessão aberta', async () => {
  const { admin, client } = localSupabase();
  const password = randomUUID();
  const org = randomUUID();
  const make = async (prefix) => {
    const email = `${prefix}-${randomUUID()}@example.invalid`;
    const { user } = checked(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    const c = client();
    checked(await c.auth.signInWithPassword({ email, password }));
    return { id: user.id, email, c };
  };
  const owner = await make('equipe-dona');
  const person = await make('equipe-pessoa');
  checked(
    await admin.from('organizations').insert({ id: org, name: 'Equipe API' }),
  );
  checked(
    await admin.from('memberships').insert({
      organization_id: org,
      user_id: owner.id,
      role: 'owner',
      display_name: 'Dona',
    }),
  );

  // Antes do vínculo a pessoa não enxerga a empresa nem lista a equipe.
  assert.deepEqual(
    checked(await person.c.from('organizations').select('id')),
    [],
  );
  const denied = await person.c.rpc('list_team_members', {
    p_organization_id: org,
  });
  assert.equal(denied.error?.code, '42501');

  const added = checked(
    await owner.c.rpc('add_team_member', {
      p_organization_id: org,
      p_email: person.email.toUpperCase(),
      p_display_name: 'Pessoa',
      p_role: 'member',
    }),
  );
  assert.equal(added, person.id);
  const team = checked(
    await owner.c.rpc('list_team_members', { p_organization_id: org }),
  );
  assert.deepEqual(
    team.map((m) => [m.display_name, m.email, m.role, m.is_self]),
    [
      ['Dona', owner.email, 'owner', true],
      ['Pessoa', person.email, 'member', false],
    ],
  );
  assert.equal(
    checked(await person.c.from('organizations').select('id')).length,
    1,
    'pessoa vinculada entra sem novo login',
  );

  // Revogar: a mesma sessão aberta deixa de ler na hora.
  checked(
    await owner.c.rpc('revoke_team_member', {
      p_organization_id: org,
      p_user_id: person.id,
    }),
  );
  assert.deepEqual(
    checked(await person.c.from('organizations').select('id')),
    [],
  );
  const after = checked(
    await owner.c.rpc('list_team_members', { p_organization_id: org }),
  );
  assert.ok(after.find((m) => m.user_id === person.id).revoked_at);

  // Ninguém se revoga, e a pessoa revogada não age.
  const self = await owner.c.rpc('revoke_team_member', {
    p_organization_id: org,
    p_user_id: owner.id,
  });
  assert.equal(self.error?.code, '22023');

  checked(
    await owner.c.rpc('restore_team_member', {
      p_organization_id: org,
      p_user_id: person.id,
    }),
  );
  assert.equal(
    checked(await person.c.from('organizations').select('id')).length,
    1,
    'restaurada volta a ler',
  );
  const audit = checked(
    await owner.c
      .from('entity_changes')
      .select('field,old_value,new_value')
      .eq('organization_id', org)
      .eq('field', 'access')
      .order('changed_at'),
  );
  assert.deepEqual(
    audit.map((a) => `${a.old_value ?? '-'}>${a.new_value}`),
    ['->ativo', 'ativo>revogado', 'revogado>ativo'],
  );
  // O colaborador não lê a auditoria da equipe.
  assert.deepEqual(
    checked(await person.c.from('entity_changes').select('id')),
    [],
  );
});

function dbContainer() {
  const names = execFileSync(
    'docker',
    ['ps', '--format', '{{.Names}}', '--filter', 'name=supabase_db_'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);
  assert.equal(names.length, 1, 'esperado exatamente um banco Supabase local');
  return names[0];
}

test('dois proprietários rebaixando um ao outro ao mesmo tempo: só um consegue', async () => {
  const container = dbContainer();
  const args = [
    'exec',
    '-i',
    container,
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-X',
    '-q',
    '-t',
    '-A',
  ];
  const run = (sql) =>
    execFileSync('docker', args, { input: sql, encoding: 'utf8' });
  const session = (sql) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.stdin.end(sql);
    return new Promise((resolve) =>
      child.on('close', (code) => resolve({ code, err })),
    );
  };
  const [u1, u2, org] = [randomUUID(), randomUUID(), randomUUID()];
  run(`
    insert into auth.users(id) values ('${u1}'),('${u2}');
    insert into public.organizations(id,name) values ('${org}','Corrida equipe');
    insert into public.memberships(organization_id,user_id,role) values ('${org}','${u1}','owner'),('${org}','${u2}','owner');
  `);
  const as = (u) => `
    select set_config('request.jwt.claims','{"sub":"${u}","role":"authenticated"}',false);
    set role authenticated;`;
  const first = session(
    `begin; ${as(u1)} select public.set_team_member_role('${org}','${u2}','member'); select pg_sleep(2.5); commit;`,
  );
  await sleep(1000);
  const started = Date.now();
  const second = session(
    `${as(u2)} select public.set_team_member_role('${org}','${u1}','member');`,
  );
  const [r1, r2] = await Promise.all([first, second]);
  assert.equal(r1.code, 0, r1.err);
  assert.notEqual(r2.code, 0, 'o segundo rebaixamento deveria ser recusado');
  assert.match(r2.err, /Acesso negado/);
  assert.ok(Date.now() - started > 1000, 'o segundo esperou o primeiro');
  assert.equal(
    run(
      `select count(*) from public.memberships where organization_id='${org}' and role='owner' and revoked_at is null;`,
    ).trim(),
    '1',
  );
});
