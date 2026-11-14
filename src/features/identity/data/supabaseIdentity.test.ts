import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createIdentityGateway } from './supabaseIdentity';

const good = (n: number) => ({
  id: `20000000-0000-4000-8000-00000000000${n}`,
  name: `Empresa ${n}`,
  establishments: [
    {
      id: `30000000-0000-4000-8000-00000000000${n}`,
      name: 'Unidade',
      timezone: 'America/Sao_Paulo',
    },
  ],
  memberships: [
    { user_id: '10000000-0000-4000-8000-000000000001', role: 'owner' },
  ],
});
function gatewayFor(data: unknown, error: unknown = null) {
  const select = vi.fn().mockResolvedValue({ data, error });
  const from = vi.fn(() => ({ select }));
  return createIdentityGateway({ from } as unknown as SupabaseClient);
}

it('uma empresa com dado inesperado não esconde as outras (P7)', async () => {
  const bad = { ...good(2), memberships: [{ user_id: 'x', role: 'dono' }] };
  const report = await gatewayFor([good(1), bad, good(3)]).loadReport!();
  expect(report.access.map((org) => org.name)).toEqual([
    'Empresa 1',
    'Empresa 3',
  ]);
  expect(report.skipped).toBe(1);
  expect(await gatewayFor([good(1), bad]).load()).toHaveLength(1);
});

it('todas válidas: nenhuma ignorada; erro de consulta continua sendo erro', async () => {
  expect((await gatewayFor([good(1)]).loadReport!()).skipped).toBe(0);
  await expect(
    gatewayFor(null, { code: '42501' }).loadReport!(),
  ).rejects.toThrow('Não foi possível consultar o acesso');
  await expect(gatewayFor({ nao: 'lista' }).loadReport!()).rejects.toThrow(
    'Não foi possível consultar o acesso',
  );
});
