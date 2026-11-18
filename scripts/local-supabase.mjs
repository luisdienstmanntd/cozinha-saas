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

// Fatia 8.1 (D-065): a mensagem e a dica do banco entram no erro (antes só o código aparecia, e falhas
// intermitentes de CI ficavam sem diagnóstico). São textos das regras do banco, sem credenciais; limitados
// a 300 caracteres. Os dados dos testes são sintéticos.
export function checked(result) {
  if (result.error) {
    const { code, status, message, hint } = result.error;
    const detail = [message, hint]
      .filter(Boolean)
      .map((text) => String(text).slice(0, 300))
      .join(' | ');
    throw new Error(
      `Operação local falhou (${code ?? status})${detail ? `: ${detail}` : ''}.`,
    );
  }
  return result.data;
}
