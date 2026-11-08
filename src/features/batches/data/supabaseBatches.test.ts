import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createBatchGateway } from './supabaseBatches';

describe('consulta de recebimentos', () => {
  it('mapeia o ID opcional do recipiente mantendo o escopo consultado', async () => {
    const rows = [
      {
        id: '20000000-0000-4000-8000-000000000001',
        product_id: '10000000-0000-4000-8000-000000000001',
        source_code: 'LOTE-01',
        quantity: 1.5,
        unit: 'kg',
        expiry_date: '2027-01-01',
        expiry_origin: 'original',
        containers: { id: '30000000-0000-4000-8000-000000000001' },
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        product_id: '10000000-0000-4000-8000-000000000001',
        source_code: 'LOTE-02',
        quantity: 2,
        unit: 'kg',
        expiry_date: '2027-01-02',
        expiry_origin: 'responsible',
        containers: null,
      },
      {
        id: '20000000-0000-4000-8000-000000000003',
        product_id: '10000000-0000-4000-8000-000000000001',
        source_code: 'LOTE-03',
        quantity: 2.5,
        unit: 'kg',
        expiry_date: '2027-01-03',
        expiry_origin: 'original',
        containers: [],
      },
    ];
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockResolvedValue({ data: rows, error: null });
    const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient;

    const result = await createBatchGateway(client).list({
      organizationId: 'org',
      establishmentId: 'unit',
    });

    expect(client.from).toHaveBeenCalledWith('batch_receipts');
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'organization_id', 'org');
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'establishment_id', 'unit');
    expect(result.map((row) => row.container_id)).toEqual([
      '30000000-0000-4000-8000-000000000001',
      null,
      null,
    ]);
  });
});
