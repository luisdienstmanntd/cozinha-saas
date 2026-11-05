import { z } from 'zod';

const environmentSchema = z.object({
  VITE_APP_MODE: z.literal('demo').default('demo'),
});

export function parseEnvironment(input: Record<string, unknown>) {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    throw new Error('VITE_APP_MODE deve ser demo nesta fase.');
  }
  return { mode: result.data.VITE_APP_MODE };
}
