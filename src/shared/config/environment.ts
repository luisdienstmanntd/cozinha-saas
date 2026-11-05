import { z } from 'zod';

const environmentSchema = z.discriminatedUnion('VITE_APP_MODE', [
  z.object({ VITE_APP_MODE: z.literal('demo') }),
  z.object({
    VITE_APP_MODE: z.literal('local'),
    VITE_SUPABASE_URL: z.literal('http://127.0.0.1:54321'),
    VITE_SUPABASE_PUBLISHABLE_KEY: z
      .string()
      .startsWith('sb_publishable_')
      .min(20),
  }),
]);

export function parseEnvironment(input: Record<string, unknown>) {
  const result = environmentSchema.safeParse({
    ...input,
    VITE_APP_MODE: input.VITE_APP_MODE ?? 'demo',
  });
  if (!result.success) {
    throw new Error(
      'Configuração inválida: use demo ou Supabase local com chave publicável.',
    );
  }
  if (result.data.VITE_APP_MODE === 'demo') return { mode: 'demo' as const };
  return {
    mode: 'local' as const,
    url: result.data.VITE_SUPABASE_URL,
    publishableKey: result.data.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}
