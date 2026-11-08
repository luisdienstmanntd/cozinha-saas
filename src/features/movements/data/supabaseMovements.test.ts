import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMovementGateway } from './supabaseMovements';
import { MovementRejected } from '../application/movementGateway';

it('trata conflito de anulação como recusa que exige conferência', async () => {
  const client = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '23505' } }),
  } as unknown as SupabaseClient;
  const gateway = createMovementGateway(client);
  await expect(
    gateway.record(
      { organizationId: 'org', establishmentId: 'unit' },
      {
        batchId: 'batch',
        kind: 'reversal',
        quantity: '0.5',
        reason: 'erro',
        intentId: '12345678-1234-4234-8234-123456789abc',
        targetId: '22345678-1234-4234-8234-123456789abc',
      },
    ),
  ).rejects.toBeInstanceOf(MovementRejected);
});

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
