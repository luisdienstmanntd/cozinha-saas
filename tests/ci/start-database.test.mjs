// Fatia 8.1 (D-065): testa scripts/ci/start-database.sh com `npm`, `npx`, `docker` e `ss` falsos, sem
// Docker nem Supabase. Confere: sucesso sem imprimir credenciais; UMA nova tentativa só para "address already
// in use"; nenhuma nova tentativa para outras falhas; credenciais mascaradas na saída de erro.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

const SCRIPT = path.resolve('scripts/ci/start-database.sh');
const SECRET = 'sb_secret_ABCDEFGHIJKLMNOPQRSTUV';
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.assinaturaFalsa1234567890';

function run(behaviors) {
  // behaviors: lista de resultados do `npm run db:start`, em ordem: 'ok' | 'porta' | 'outro'.
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-start-'));
  const calls = path.join(dir, 'calls.log');
  const counter = path.join(dir, 'counter');
  writeFileSync(counter, '0');
  const fake = (name, body) => {
    const file = path.join(dir, name);
    writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(file, 0o755);
  };
  fake(
    'npm',
    `n=$(($(cat "${counter}")+1)); echo $n > "${counter}"
echo "npm $*" >> "${calls}"
case "$(echo '${behaviors.join(' ')}' | cut -d' ' -f$n)" in
  ok) echo '{"SECRET_KEY":"${SECRET}","ANON_KEY":"${JWT}"}'; exit 0;;
  porta) echo 'failed to bind host port 0.0.0.0:54322/tcp: address already in use'; echo '{"SECRET_KEY":"${SECRET}"}'; exit 1;;
  *) echo 'migration failed'; echo '{"SECRET_KEY":"${SECRET}","ANON_KEY":"${JWT}"}'; exit 1;;
esac`,
  );
  fake('npx', `echo "npx $*" >> "${calls}"; exit 0`);
  fake('docker', 'exit 0');
  fake('ss', 'echo "LISTEN 0 4096 0.0.0.0:54322 0.0.0.0:*"');
  fake('sudo', 'shift; exec "$@"');
  const result = spawnSync('bash', [SCRIPT], {
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      RUNNER_TEMP: dir,
    },
    encoding: 'utf8',
  });
  const log = readFileSync(calls, 'utf8');
  return {
    status: result.status,
    out: `${result.stdout}${result.stderr}`,
    npmCalls: log.split('\n').filter((l) => l.startsWith('npm ')).length,
    stopCalls: log.split('\n').filter((l) => l.startsWith('npx supabase stop'))
      .length,
  };
}

test('sucesso na primeira vez: uma chamada, nenhuma credencial na saída', () => {
  const r = run(['ok']);
  assert.equal(r.status, 0);
  assert.equal(r.npmCalls, 1);
  assert.doesNotMatch(r.out, /sb_secret_|eyJ/);
});

test('porta em uso e depois sucesso: uma nova tentativa, com aviso visível', () => {
  const r = run(['porta', 'ok']);
  assert.equal(r.status, 0);
  assert.equal(r.npmCalls, 2);
  assert.equal(r.stopCalls, 1);
  assert.match(r.out, /::warning title=Porta do Supabase local em uso/);
  assert.match(r.out, /::warning title=Supabase iniciou na segunda tentativa/);
  assert.doesNotMatch(r.out, new RegExp(SECRET));
});

test('porta em uso duas vezes: falha depois de UMA nova tentativa, sem credencial', () => {
  const r = run(['porta', 'porta', 'ok']);
  assert.equal(r.status, 1);
  assert.equal(r.npmCalls, 2);
  assert.match(r.out, /::error title=Supabase local não iniciou/);
  assert.doesNotMatch(r.out, new RegExp(SECRET));
});

test('outra falha (migração, imagem): nenhuma nova tentativa e credenciais mascaradas', () => {
  const r = run(['outro', 'ok']);
  assert.equal(r.status, 1);
  assert.equal(r.npmCalls, 1);
  assert.equal(r.stopCalls, 0);
  assert.match(r.out, /migration failed/);
  assert.match(r.out, /\*\*\*/);
  assert.doesNotMatch(r.out, new RegExp(SECRET));
  assert.doesNotMatch(r.out, /eyJhbGci/);
});
