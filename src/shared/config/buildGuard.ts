import { parseEnvironment } from './environment';

type BuildEnvironment = Record<string, string | undefined>;

// Nomes e valores que nunca podem entrar no bundle público. Tudo que começa com VITE_ vai para o
// navegador de qualquer visitante; chave de serviço, senha ou token administrativo ali seria vazamento.
const FORBIDDEN_NAME =
  /SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|DATABASE_URL|ACCESS_TOKEN|DB_URL/i;
const FORBIDDEN_VALUE = /^sb_secret_|service_role/i;

// Valida a configuração antes de gerar o aplicativo. Numa hospedagem (Cloudflare Pages define CF_PAGES=1) ou
// quando o modo pedido é `hosted`, uma configuração ausente ou errada INTERROMPE o build, em vez de gerar
// um site que cairia na demonstração sem ninguém notar. Nunca imprime valores, só os nomes das variáveis.
export function assertBuildEnvironment(env: BuildEnvironment) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue;
    if (FORBIDDEN_NAME.test(name) || FORBIDDEN_VALUE.test(value ?? '')) {
      throw new Error(
        `Build interrompido: a variável ${name} parece conter segredo e iria para o navegador. Remova-a (só VITE_* públicas entram no bundle).`,
      );
    }
  }
  const onHosting = env.CF_PAGES === '1';
  const asksHosted = env.VITE_APP_MODE === 'hosted';
  if (!onHosting && !asksHosted) return { hosted: false as const };
  if (
    onHosting &&
    env.VITE_APP_MODE === 'demo' &&
    env.VITE_ALLOW_PUBLIC_DEMO === 'true'
  )
    return { hosted: false as const };
  try {
    const config = parseEnvironment(env);
    if (config.mode !== 'hosted') throw new Error('modo');
    return { hosted: true as const, supabaseUrl: config.url };
  } catch {
    throw new Error(
      'Build interrompido: configuração hospedada ausente ou inválida. Defina VITE_APP_MODE=hosted, VITE_SUPABASE_URL (https://<projeto>.supabase.co), VITE_SUPABASE_PUBLISHABLE_KEY (sb_publishable_...), VITE_APP_ENV (testes ou producao), VITE_APP_URL (endereço oficial https, sem barra final, ex.: https://cozzigo.pages.dev). Veja docs/FASE_08_4A.md.',
    );
  }
}
