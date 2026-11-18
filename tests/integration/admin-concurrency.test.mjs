import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

// Fatia 8.4a (D-067): operações administrativas (bootstrap, vínculo, declaração do ambiente e reset)
// disputam um cadeado; a segunda chamada simultânea é recusada em vez de rodar por cima da primeira.
// Usa duas sessões psql reais dentro do contêiner do banco local (papel postgres).
const container = 'supabase_db_cozinha-saas';
const run = promisify(execFile);
const psql = (sql) =>
  run('docker', [
    'exec',
    container,
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ]);

function dockerAvailable() {
  try {
    execFileSync('docker', ['exec', container, 'true'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test(
  'segunda operação administrativa simultânea é recusada',
  { skip: dockerAvailable() ? false : 'contêiner do banco local indisponível' },
  async () => {
    const first = psql(
      'begin; select private.acquire_admin_lock(); select pg_sleep(6); rollback;',
    );
    await sleep(2000);
    await assert.rejects(
      psql('begin; select private.acquire_admin_lock(); rollback;'),
      (error) =>
        /Outra operação administrativa está em andamento/.test(error.stderr),
    );
    await assert.rejects(
      psql("select private.declare_environment('testes')"),
      (error) =>
        /Outra operação administrativa está em andamento/.test(error.stderr),
    );
    await first;
    // Terminada a primeira, a próxima passa.
    await psql('begin; select private.acquire_admin_lock(); rollback;');
  },
);
