import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLabelGateway } from './supabaseLabels';

function clientFor(
  handlingId: string | null,
  voidRow: unknown,
  blocks: unknown[] = [],
) {
  const container = {
    id: '12345678-1234-4234-8234-123456789abc',
    organization_id: '22345678-1234-4234-8234-123456789abc',
    establishment_id: '32345678-1234-4234-8234-123456789abc',
    short_code: 'C-000002',
    handling_id: handlingId,
    batch_receipts: {
      source_code: '0001',
      quantity: 1,
      unit: 'kg',
      expiry_date: '2027-01-01',
      expiry_origin: 'original',
      products: { name: 'Arroz' },
    },
  };
  const query = (result: unknown) => {
    const q = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: result, error: null }),
    };
    q.select.mockReturnValue(q);
    q.eq.mockReturnValue(q);
    return q;
  };
  const containers = query(container);
  const voids = query(voidRow);
  const from = vi.fn((table: string) =>
    table === 'handling_voids' ? voids : containers,
  );
  const rpc = vi.fn((name: string) =>
    Promise.resolve(
      name === 'container_blocks'
        ? { data: blocks, error: null }
        : { data: [{ container_id: container.id, balance: 0 }], error: null },
    ),
  );
  return {
    client: { from, rpc } as unknown as SupabaseClient,
    from,
    rpc,
    voids,
  };
}

it('marca como anulado o derivado cuja manipulação tem anulação visível (fatia 6.4)', async () => {
  const handlingId = '42345678-1234-4234-8234-123456789abc';
  const { client, voids } = clientFor(handlingId, {
    id: '52345678-1234-4234-8234-123456789abc',
  });
  const label = await createLabelGateway(client).get(
    '12345678-1234-4234-8234-123456789abc',
  );
  expect(voids.eq).toHaveBeenCalledWith('handling_id', handlingId);
  expect(label.voided).toBe(true);
});

it('integral e derivado sem anulação continuam com etiqueta (fatia 6.4)', async () => {
  const integral = clientFor(null, null);
  expect(
    (
      await createLabelGateway(integral.client).get(
        '12345678-1234-4234-8234-123456789abc',
      )
    ).voided,
  ).toBe(false);
  expect(integral.from).not.toHaveBeenCalledWith('handling_voids');
  const derived = clientFor('42345678-1234-4234-8234-123456789abc', null);
  expect(
    (
      await createLabelGateway(derived.client).get(
        '12345678-1234-4234-8234-123456789abc',
      )
    ).voided,
  ).toBe(false);
});

it('marca o derivado de manipulação tardia sem liberação e não o integral (fatia 6.5a)', async () => {
  const handlingId = '42345678-1234-4234-8234-123456789abc';
  const held = clientFor(handlingId, null, [
    { kind: 'late_handling', status: 'pending' },
  ]);
  const label = await createLabelGateway(held.client).get(
    '12345678-1234-4234-8234-123456789abc',
  );
  expect(held.rpc).toHaveBeenCalledWith('container_blocks', {
    p_organization_id: '22345678-1234-4234-8234-123456789abc',
    p_establishment_id: '32345678-1234-4234-8234-123456789abc',
    p_container_id: '12345678-1234-4234-8234-123456789abc',
  });
  expect(label.late_hold).toBe(true);
  const released = clientFor(handlingId, null, []);
  expect(
    (
      await createLabelGateway(released.client).get(
        '12345678-1234-4234-8234-123456789abc',
      )
    ).late_hold,
  ).toBe(false);
  // Desde a 6.5b o integral também é consultado (recebimento sem medição); sem bloqueio, nada muda.
  const integral = clientFor(null, null);
  const free = await createLabelGateway(integral.client).get(
    '12345678-1234-4234-8234-123456789abc',
  );
  expect(free.late_hold).toBe(false);
  expect(free.hold).toBeNull();
});

it('marca o integral bloqueado por recebimento sem medição, sem recusar a etiqueta (fatia 6.5b)', async () => {
  const pending = clientFor(null, null, [
    { kind: 'temperature_not_measured', status: 'pending' },
  ]);
  const label = await createLabelGateway(pending.client).get(
    '12345678-1234-4234-8234-123456789abc',
  );
  expect(pending.rpc).toHaveBeenCalledWith('container_blocks', {
    p_organization_id: '22345678-1234-4234-8234-123456789abc',
    p_establishment_id: '32345678-1234-4234-8234-123456789abc',
    p_container_id: '12345678-1234-4234-8234-123456789abc',
  });
  expect(label.hold).toBe('pending');
  expect(label.late_hold).toBe(false);
  const rejected = clientFor('42345678-1234-4234-8234-123456789abc', null, [
    { kind: 'temperature_not_measured', status: 'pending' },
    { kind: 'temperature_not_measured', status: 'rejected' },
  ]);
  expect(
    (
      await createLabelGateway(rejected.client).get(
        '12345678-1234-4234-8234-123456789abc',
      )
    ).hold,
  ).toBe('rejected');
});

it('lê da manipulação os dados da etiqueta de produto aberto (fatia 6.7)', async () => {
  const id = '12345678-1234-4234-8234-123456789abc';
  const handlingId = '42345678-1234-4234-8234-123456789abc';
  const container = {
    id,
    organization_id: '22345678-1234-4234-8234-123456789abc',
    establishment_id: '32345678-1234-4234-8234-123456789abc',
    short_code: 'C-000002',
    handling_id: handlingId,
    position: 2,
    storage: 'refrigerated',
    batch_receipts: {
      source_code: '0001',
      quantity: 10,
      unit: 'kg',
      expiry_date: '2027-01-01',
      expiry_origin: 'original',
      suppliers: { name: 'Granja' },
      products: { name: 'Frango' },
    },
  };
  const handling = {
    kind: 'portioning',
    handled_at: '2026-11-13T23:22:00Z',
    timezone: 'America/Sao_Paulo',
    handled_by_name: 'Ana',
    expiry_date: '2026-11-18',
    storage: 'refrigerated',
  };
  const chain = (single: unknown, many: unknown) => {
    const q: Record<string, unknown> = {};
    q.select = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: single, error: null });
    q.then = (resolve: (value: unknown) => unknown) =>
      resolve({ data: many, error: null });
    return q;
  };
  const from = vi.fn((table: string) =>
    table === 'container_handlings'
      ? chain(handling, null)
      : table === 'handling_voids'
        ? chain(null, null)
        : chain(container, [
            { id: 'a' },
            { id: 'b' },
            { id: 'c' },
            { id: 'd' },
          ]),
  );
  const rpc = vi.fn((name: string) =>
    Promise.resolve({
      data:
        name === 'container_blocks'
          ? []
          : [
              {
                container_id: id,
                balance: 2,
                kind: 'derived',
                expiry_date: '2026-11-18',
                expiry_origin: 'handling',
                initial_quantity: 2,
              },
            ],
      error: null,
    }),
  );
  const label = await createLabelGateway({
    from,
    rpc,
  } as unknown as SupabaseClient).get(id);
  expect(label.handling).toEqual({
    ...handling,
    position: 2,
    siblings: 4,
  });
  expect(label.storage).toBe('refrigerated');
  expect(label.batch_receipts.suppliers?.name).toBe('Granja');
  expect(label.effective?.expiry_date).toBe('2026-11-18');
});

it('dados da manipulação ilegíveis deixam o derivado sem `handling` (o PDF recusa)', async () => {
  const { client } = clientFor('42345678-1234-4234-8234-123456789abc', null);
  const label = await createLabelGateway(client).get(
    '12345678-1234-4234-8234-123456789abc',
  );
  expect(label.handling).toBeUndefined();
});
