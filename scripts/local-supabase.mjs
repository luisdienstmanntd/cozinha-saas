import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

// Capture credentials in memory; never echo CLI status or privileged keys.
export function localSupabase() {
  let status;
  try {
    status = JSON.parse(
      execFileSync(
        process.execPath,
        ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    );
  } catch {
    throw new Error('Supabase local indisponível. Execute npm run db:start.');
  }
  const url = status.API_URL;
  if (url !== 'http://127.0.0.1:54321') {
    throw new Error(
      'Testes permitidos somente na API local descartável 127.0.0.1:54321.',
    );
  }
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error('Credenciais locais não encontradas no status da CLI.');
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  return {
    url,
    publishableKey: status.PUBLISHABLE_KEY,
    admin: createClient(url, status.SERVICE_ROLE_KEY, options),
    client: () => createClient(url, status.ANON_KEY, options),
  };
}

export function checked(result) {
  if (result.error)
    throw new Error(
      `Operação local falhou (${result.error.code ?? result.error.status}).`,
    );
  return result.data;
}
