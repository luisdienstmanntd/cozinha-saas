import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLabelGateway } from './supabaseLabels';

function clientFor(handlingId: string | null, voidRow: unknown) {
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
  const rpc = vi.fn().mockResolvedValue({
    data: [{ container_id: container.id, balance: 0 }],
    error: null,
  });
  return {
    client: { from, rpc } as unknown as SupabaseClient,
    from,
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
