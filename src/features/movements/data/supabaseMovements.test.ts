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

it('lê só os movimentos do recipiente integral do recebimento (fatia 6.1)', async () => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null, count: 0 }),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { id: 'unit' }, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  const client = {
    from: vi.fn().mockReturnValue(query),
  } as unknown as SupabaseClient;
  await createMovementGateway(client).list(
    { organizationId: 'org', establishmentId: 'unit' },
    'batch',
  );
  expect(query.select.mock.calls[0]?.[0]).toContain('containers!inner(kind)');
  expect(query.eq).toHaveBeenCalledWith('batch_id', 'batch');
  expect(query.eq).toHaveBeenCalledWith('containers.kind', 'integral');
});

it('aceita a transferência de manipulação na leitura e guarda a manipulação de origem (fatia 6.3)', async () => {
  const row = {
    id: '12345678-1234-4234-8234-123456789abc',
    kind: 'transfer',
    quantity: 4,
    reason: null,
    created_by: '22345678-1234-4234-8234-123456789abc',
    created_at: '2026-01-01T12:00:00Z',
    timezone: 'UTC',
    reverses_id: null,
    handling_id: '32345678-1234-4234-8234-123456789abc',
    containers: { kind: 'integral' },
  };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data: [row], error: null, count: 1 }),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { id: 'unit' }, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  const client = {
    from: vi.fn().mockReturnValue(query),
  } as unknown as SupabaseClient;
  const [event] = await createMovementGateway(client).list(
    { organizationId: 'org', establishmentId: 'unit' },
    'batch',
  );
  expect(query.select.mock.calls[0]?.[0]).toContain('handling_id');
  expect(event).toMatchObject({
    kind: 'transfer',
    quantity: 4,
    handlingId: '32345678-1234-4234-8234-123456789abc',
  });
});
