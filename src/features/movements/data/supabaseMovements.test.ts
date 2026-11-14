import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMovementGateway } from './supabaseMovements';
import {
  MovementBlocked,
  MovementRejected,
} from '../application/movementGateway';

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

it('aceita a devolução da anulação de manipulação na leitura (fatia 6.4)', async () => {
  const row = {
    id: '12345678-1234-4234-8234-123456789abc',
    kind: 'transfer_reversal',
    quantity: 4,
    reason: 'Validade digitada errada',
    created_by: '22345678-1234-4234-8234-123456789abc',
    created_at: '2026-01-01T12:00:00Z',
    timezone: 'UTC',
    reverses_id: '42345678-1234-4234-8234-123456789abc',
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
  expect(event).toMatchObject({
    kind: 'transfer_reversal',
    quantity: 4,
    reverses_id: '42345678-1234-4234-8234-123456789abc',
    handlingId: '32345678-1234-4234-8234-123456789abc',
  });
});

it('recusa por bloqueio leva a mensagem do banco; outra recusa continua genérica (fatia 6.5b)', async () => {
  const blockedMessage =
    'Recipiente bloqueado: ocorrência rejeitada pelo proprietário. Só o descarte é permitido.';
  const input = {
    batchId: '12345678-1234-4234-8234-123456789abc',
    kind: 'consumption' as const,
    quantity: '1',
    reason: null,
    intentId: '22345678-1234-4234-8234-123456789abc',
  };
  const scope = { organizationId: 'org', establishmentId: 'unit' };
  const blocked = createMovementGateway({
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: { code: '22023', message: blockedMessage },
    }),
  } as unknown as SupabaseClient);
  const error = await blocked.record(scope, input).catch((cause) => cause);
  expect(error).toBeInstanceOf(MovementBlocked);
  expect(error).toBeInstanceOf(MovementRejected);
  expect(error.message).toBe(blockedMessage);
  const other = createMovementGateway({
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'Saldo insuficiente no recipiente.' },
    }),
  } as unknown as SupabaseClient);
  const generic = await other.record(scope, input).catch((cause) => cause);
  expect(generic).not.toBeInstanceOf(MovementBlocked);
  expect(generic.message).toBe('Saída recusada.');
});

it('recusa por vencimento leva a mensagem do banco (fatia 6.11)', async () => {
  const message =
    'Recipiente vencido: a validade registrada (01/01/2026) já passou na data da unidade. Consumo recusado; o descarte continua permitido.';
  const gateway = createMovementGateway({
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: { code: '22023', message },
    }),
  } as unknown as SupabaseClient);
  const error = await gateway
    .record(
      { organizationId: 'org', establishmentId: 'unit' },
      {
        batchId: '12345678-1234-4234-8234-123456789abc',
        kind: 'consumption',
        quantity: '1',
        reason: null,
        intentId: '22345678-1234-4234-8234-123456789abc',
      },
    )
    .catch((cause) => cause);
  expect(error).toBeInstanceOf(MovementBlocked);
  expect(error.message).toBe(message);
});
