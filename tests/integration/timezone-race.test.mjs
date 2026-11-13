// Fase 6, fatia 6.0c (I-11, teste 21): corrida entre UPDATE de fuso e receive_batch.
// Precisa de duas sessões SQL abertas ao mesmo tempo, o que a API REST não permite com precisão.
// Usa psql dentro do contêiner do banco local descartável; os dados criados ficam (histórico é append-only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

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
const container = dbContainer();

function psqlArgs() {
  return [
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
}
function run(sql) {
  return execFileSync('docker', psqlArgs(), { input: sql, encoding: 'utf8' });
}
// Sessão em segundo plano: devolve { done: Promise<{code, out, err}> }.
function session(sql) {
  const child = spawn('docker', psqlArgs(), {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  child.stdin.end(sql);
  const done = new Promise((resolve) =>
    child.on('close', (code) => resolve({ code, out, err })),
  );
  return { done };
}

function fixture() {
  const id = () => randomUUID();
  const f = {
    user: id(),
    org: id(),
    est: id(),
    product: id(),
    supplier: id(),
    intent: id(),
  };
  run(`
    insert into auth.users(id) values ('${f.user}');
    insert into public.organizations(id,name) values ('${f.org}','Corrida fuso');
    insert into public.establishments(id,organization_id,name,timezone) values ('${f.est}','${f.org}','Unidade','America/Sao_Paulo');
    insert into public.memberships(organization_id,user_id,role) values ('${f.org}','${f.user}','owner');
    insert into public.products(id,organization_id,establishment_id,name,unit) values ('${f.product}','${f.org}','${f.est}','P','kg');
    insert into public.suppliers(id,organization_id,establishment_id,name) values ('${f.supplier}','${f.org}','${f.est}','F');
  `);
  return f;
}
const asOwner = (f) => `
  select set_config('request.jwt.claims','{"sub":"${f.user}","role":"authenticated"}',false);
  set role authenticated;`;
const receive = (f) =>
  `select public.receive_batch('${f.org}','${f.est}','${f.product}','${f.supplier}','L1',5,'2027-01-01','original','2027-01-01','${f.intent}');`;
const changeZone = (f) =>
  `update public.establishments set timezone='America/Manaus' where id='${f.est}';`;
const state = (f) => {
  const [zone, receiptZone] = run(
    `select (select timezone from public.establishments where id='${f.est}'),
            coalesce((select timezone from public.batch_receipts where establishment_id='${f.est}'),'-');`,
  )
    .trim()
    .split('|');
  return { zone, receiptZone };
};

test('recebimento em andamento segura a mudança de fuso até confirmar, e a mudança é recusada', async () => {
  const f = fixture();
  // A: recebe e demora a confirmar. B: tenta mudar o fuso no meio.
  const a = session(
    `begin; ${asOwner(f)} ${receive(f)} select pg_sleep(2.5); commit;`,
  );
  await sleep(1000);
  const started = Date.now();
  const b = session(`${asOwner(f)} ${changeZone(f)}`);
  const [ra, rb] = await Promise.all([a.done, b.done]);
  assert.equal(ra.code, 0, ra.err);
  assert.notEqual(
    rb.code,
    0,
    'a mudança de fuso concorrente deveria ser recusada',
  );
  assert.match(rb.err, /primeiro recebimento/);
  assert.ok(
    Date.now() - started > 1000,
    'B deveria ter esperado o recebimento confirmar',
  );
  const s = state(f);
  assert.equal(s.zone, 'America/Sao_Paulo');
  assert.equal(s.receiptZone, 'America/Sao_Paulo');
});

test('mudança de fuso em andamento segura o recebimento, que grava o fuso novo', async () => {
  const f = fixture();
  const b = session(
    `begin; ${asOwner(f)} ${changeZone(f)} select pg_sleep(2.5); commit;`,
  );
  await sleep(1000);
  const a = session(`${asOwner(f)} ${receive(f)}`);
  const [rb, ra] = await Promise.all([b.done, a.done]);
  assert.equal(rb.code, 0, rb.err);
  assert.equal(ra.code, 0, ra.err);
  const s = state(f);
  assert.equal(s.zone, 'America/Manaus');
  assert.equal(
    s.receiptZone,
    'America/Manaus',
    'o recebimento deve usar o fuso vigente',
  );
});
