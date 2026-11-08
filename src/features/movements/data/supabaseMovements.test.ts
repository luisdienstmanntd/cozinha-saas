import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMovementGateway } from './supabaseMovements';

it('recusa histórico truncado sem calcular saldo parcial', async () => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null, count: 1001 }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  const client = {
    from: vi.fn().mockReturnValue(query),
  } as unknown as SupabaseClient;
  const gateway = createMovementGateway(client);
  await expect(
    gateway.list({ organizationId: 'org', establishmentId: 'unit' }, 'batch'),
  ).rejects.toThrow('O histórico excede o limite de 1.000 eventos.');
});
