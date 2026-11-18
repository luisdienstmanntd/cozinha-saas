// Fatia 8.4a: verificação SOMENTE LEITURA de um projeto Supabase (hospedado ou local), usando apenas o
// endereço e a chave PUBLICÁVEL (as mesmas que o navegador já recebe). Não cria conta, não grava, não usa
// chave de serviço. Confere o que luis precisa ter configurado no painel:
//   1. cadastro público desligado (GET /auth/v1/settings → disable_signup);
//   2. acesso anônimo (login anônimo) desligado;
//   3. confirmação de e-mail ligada (a conta não entra sem confirmar);
//   4. a API anônima não lê nenhuma tabela do aplicativo.
// Uso:  VERIFY_SUPABASE_URL=https://<projeto>.supabase.co VERIFY_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
//         node scripts/hosted/verify-hosted.mjs
// Saída: uma linha por conferência (OK/FALHA/AVISO) e código de saída 1 se alguma FALHAR. Não imprime chaves.
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const PROTECTED_TABLES = [
  'organizations',
  'establishments',
  'memberships',
  'batch_receipts',
  'containers',
  'stock_movements',
];

export async function verifyProject({
  url,
  publishableKey,
  fetchImpl = fetch,
}) {
  const base = new URL(url).origin;
  const headers = {
    apikey: publishableKey,
    'content-type': 'application/json',
  };
  const results = [];
  const add = (status, name, detail) => results.push({ status, name, detail });

  try {
    const response = await fetchImpl(`${base}/auth/v1/settings`, { headers });
    const settings = response.ok ? await response.json() : null;
    if (!settings) {
      add('FALHA', 'configurações de autenticação', `HTTP ${response.status}`);
    } else {
      add(
        settings.disable_signup === true ? 'OK' : 'FALHA',
        'cadastro público desligado',
        settings.disable_signup === true
          ? 'disable_signup = true'
          : 'Desative em Authentication > Sign In / Providers > "Allow new users to sign up"',
      );
      const anonymous = settings.external?.anonymous_users;
      add(
        anonymous === false ? 'OK' : anonymous === true ? 'FALHA' : 'AVISO',
        'login anônimo desligado',
        anonymous === undefined
          ? 'o projeto não informou; confira em Authentication > Sign In / Providers'
          : `anonymous_users = ${anonymous}`,
      );
      add(
        settings.mailer_autoconfirm === false ? 'OK' : 'AVISO',
        'confirmação de e-mail exigida no cadastro',
        settings.mailer_autoconfirm === false
          ? 'mailer_autoconfirm = false'
          : 'mailer_autoconfirm ligado ou desconhecido; confira "Confirm email"',
      );
      const providers = Object.entries(settings.external ?? {})
        .filter(
          ([name, enabled]) =>
            enabled === true &&
            name !== 'email' &&
            name !== 'phone' &&
            name !== 'anonymous_users',
        )
        .map(([name]) => name);
      add(
        providers.length === 0 ? 'OK' : 'AVISO',
        'sem login por provedor externo',
        providers.length === 0
          ? 'nenhum provedor social ligado'
          : `ligados: ${providers.join(', ')}`,
      );
    }
  } catch {
    add(
      'FALHA',
      'configurações de autenticação',
      'não foi possível consultar o projeto',
    );
  }

  for (const table of PROTECTED_TABLES) {
    try {
      const response = await fetchImpl(
        `${base}/rest/v1/${table}?select=id&limit=1`,
        { headers },
      );
      const body = await response.text();
      let leaked = false;
      if (response.ok) {
        try {
          leaked =
            Array.isArray(JSON.parse(body)) && JSON.parse(body).length > 0;
        } catch {
          leaked = true;
        }
      }
      add(
        leaked
          ? 'FALHA'
          : response.status === 401 || response.status === 403
            ? 'OK'
            : 'AVISO',
        `API anônima sem acesso a ${table}`,
        leaked ? 'a API anônima devolveu linhas' : `HTTP ${response.status}`,
      );
    } catch {
      add(
        'FALHA',
        `API anônima sem acesso a ${table}`,
        'não foi possível consultar',
      );
    }
  }
  return results;
}

async function main() {
  const url = process.env.VERIFY_SUPABASE_URL;
  const publishableKey = process.env.VERIFY_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey?.startsWith('sb_publishable_'))
    throw new Error(
      'Defina VERIFY_SUPABASE_URL e VERIFY_SUPABASE_PUBLISHABLE_KEY (chave publicável sb_publishable_...).',
    );
  const results = await verifyProject({ url, publishableKey });
  for (const r of results)
    process.stdout.write(`${r.status.padEnd(5)} ${r.name} — ${r.detail}\n`);
  if (results.some((r) => r.status === 'FALHA')) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
