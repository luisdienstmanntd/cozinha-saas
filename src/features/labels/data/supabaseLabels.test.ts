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
  const integral = clientFor(null, null);
  await createLabelGateway(integral.client).get(
    '12345678-1234-4234-8234-123456789abc',
  );
  expect(integral.rpc).not.toHaveBeenCalledWith(
    'container_blocks',
    expect.anything(),
  );
});
