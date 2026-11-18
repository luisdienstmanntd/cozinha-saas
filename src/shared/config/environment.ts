import { z } from 'zod';

// Endereço de um projeto Supabase hospedado: só https, só o domínio do projeto (20 letras/dígitos),
// sem caminho, porta, usuário ou parâmetros. Qualquer outra coisa é recusada para que um erro de
// digitação (ou uma URL de outro serviço) não passe despercebido.
const HOSTED_SUPABASE_HOST = /^[a-z0-9]{20}\.supabase\.co$/;

const hostedUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      HOSTED_SUPABASE_HOST.test(url.hostname) &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '' &&
      value === url.origin
    );
  } catch {
    return false;
  }
});

// Fatia 8.4b: endereço oficial do sistema (vai no QR das etiquetas). Só https, só o nome da máquina
// (sem porta, usuário, caminho, parâmetros ou barra final), nome público com ponto e sem IP, localhost
// ou sufixos internos. Trocar para um domínio próprio é só mudar a variável, sem mexer no código.
const HOST_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const INTERNAL_SUFFIX =
  /\.(local|localhost|internal|lan|home|test|invalid|example)$/;

export function parseOfficialOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const labels = url.hostname.split('.');
    const valid =
      url.protocol === 'https:' &&
      value === url.origin &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '' &&
      value.length <= 253 &&
      labels.length >= 2 &&
      labels.every((label) => HOST_LABEL.test(label)) &&
      /^[a-z]{2,}$/.test(labels[labels.length - 1] ?? '') &&
      !INTERNAL_SUFFIX.test(url.hostname);
    return valid ? value : null;
  } catch {
    return null;
  }
}

const officialOrigin = z
  .string()
  .refine((value) => parseOfficialOrigin(value) !== null);

const publishableKey = z.string().startsWith('sb_publishable_').min(20);

const environmentSchema = z.discriminatedUnion('VITE_APP_MODE', [
  z.object({ VITE_APP_MODE: z.literal('demo') }),
  z.object({
    VITE_APP_MODE: z.literal('local'),
    VITE_SUPABASE_URL: z.literal('http://127.0.0.1:54321'),
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  }),
  // Fatia 8.4a: ambiente hospedado. Exige tudo de forma explícita; nunca cai na demonstração.
  z.object({
    VITE_APP_MODE: z.literal('hosted'),
    VITE_SUPABASE_URL: hostedUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    VITE_APP_ENV: z.enum(['testes', 'producao']),
    VITE_APP_URL: officialOrigin,
  }),
]);

export type HostedEnvironmentName = 'testes' | 'producao';

export function parseEnvironment(input: Record<string, unknown>) {
  const result = environmentSchema.safeParse({
    ...input,
    VITE_APP_MODE: input.VITE_APP_MODE ?? 'demo',
  });
  if (!result.success) {
    throw new Error(
      'Configuração inválida: use demo, Supabase local ou ambiente hospedado completo.',
    );
  }
  if (result.data.VITE_APP_MODE === 'demo') return { mode: 'demo' as const };
  if (result.data.VITE_APP_MODE === 'hosted')
    return {
      mode: 'hosted' as const,
      url: result.data.VITE_SUPABASE_URL,
      publishableKey: result.data.VITE_SUPABASE_PUBLISHABLE_KEY,
      environmentName: result.data.VITE_APP_ENV as HostedEnvironmentName,
      appUrl: result.data.VITE_APP_URL,
    };
  return {
    mode: 'local' as const,
    url: result.data.VITE_SUPABASE_URL,
    publishableKey: result.data.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

// Máquinas onde a demonstração e o Supabase local fazem sentido (desenvolvimento e testes).
export function isLocalHostname(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

// Regra do "nunca cair em silêncio na demonstração": numa hospedagem pública (nome de máquina que não
// é local), só o modo `hosted` completo é aceito. Demonstração e Supabase local ali são configuração
// esquecida ou errada. A demonstração pública só existe se pedida por escrito (VITE_ALLOW_PUBLIC_DEMO).
export function assertModeAllowedOnHost(
  mode: 'demo' | 'local' | 'hosted',
  hostname: string,
  input: Record<string, unknown>,
) {
  if (mode === 'hosted' || isLocalHostname(hostname)) return;
  if (mode === 'demo' && input.VITE_ALLOW_PUBLIC_DEMO === 'true') return;
  throw new Error(
    'Configuração inválida: esta hospedagem exige o modo hosted completo.',
  );
}
