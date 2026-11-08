import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createBatchGateway } from './supabaseBatches';

describe('consulta de recebimentos', () => {
  it('não retorna a primeira página se uma página posterior falhar', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      product_id: '10000000-0000-4000-8000-000000000001',
      source_code: 'L',
      quantity: 1,
      unit: 'kg',
      expiry_date: '2026-01-01',
      expiry_origin: 'original',
      containers: null,
      products: { name: 'Arroz' },
    }));
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      gt: vi.fn(),
      limit: vi.fn(),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.gt.mockReturnValue(chain);
    chain.limit
      .mockResolvedValueOnce({ data: rows, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
    await expect(
      createBatchGateway(client).list({
        organizationId: 'org',
        establishmentId: 'unit',
      }),
    ).rejects.toThrow('Não foi possível consultar todos');
  });
  it('recusa apresentar um resultado truncado acima de 10000 registros', async () => {
    const rows = Array.from({ length: 10001 }, (_, i) => ({
      id: `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      product_id: '10000000-0000-4000-8000-000000000001',
      source_code: 'L',
      quantity: 1,
      unit: 'kg',
      expiry_date: '2026-01-01',
      expiry_origin: 'original',
      containers: null,
      products: { name: 'Arroz' },
    }));
    let cursor: string | null = null;
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      gt: vi.fn(),
      limit: vi.fn(),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.gt.mockImplementation((_column: string, value: string) => {
      cursor = value;
      return chain;
    });
    chain.limit.mockImplementation(async (limit: number) => ({
      data: rows
        .filter((row) => cursor === null || row.id > cursor)
        .slice(0, limit),
      error: null,
    }));
    const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
    await expect(
      createBatchGateway(client).list({
        organizationId: 'org',
        establishmentId: 'unit',
      }),
    ).rejects.toThrow('limite de 10.000');
  });
  it('não apresenta resultado parcial se o acesso for revogado durante a consulta', async () => {
    const rows = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    rows.select.mockReturnValue(rows);
    rows.eq.mockReturnValue(rows);
    rows.order.mockReturnValue(rows);
    const access = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    access.select.mockReturnValue(access);
    access.eq.mockReturnValue(access);
    const client = {
      from: vi.fn((table: string) =>
        table === 'establishments' ? access : rows,
      ),
    } as unknown as SupabaseClient;
    await expect(
      createBatchGateway(client).list({
        organizationId: 'org',
        establishmentId: 'unit',
      }),
    ).rejects.toThrow('Acesso ao estabelecimento indisponível');
  });
  it('percorre mais de 1000 registros e usa nome do produto associado', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      id: `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      product_id: '10000000-0000-4000-8000-000000000001',
      source_code: `LOTE-${i}`,
      quantity: 1,
      unit: 'kg',
      expiry_date: '2026-01-01',
      expiry_origin: 'original',
      containers: null,
      products: { name: 'Produto fora do catálogo carregado' },
    }));
    let cursor: string | null = null;
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      gt: vi.fn(),
      limit: vi.fn(),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.gt.mockImplementation((_column: string, value: string) => {
      cursor = value;
      return chain;
    });
    chain.limit.mockImplementation(async (limit: number) => ({
      data: rows
        .filter((row) => cursor === null || row.id > cursor)
        .slice(0, limit),
      error: null,
    }));
    const access = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { id: 'unit' }, error: null }),
    };
    access.select.mockReturnValue(access);
    access.eq.mockReturnValue(access);
    const client = {
      from: vi.fn((table: string) =>
        table === 'establishments' ? access : chain,
      ),
    } as unknown as SupabaseClient;
    const result = await createBatchGateway(client).list({
      organizationId: 'org',
      establishmentId: 'unit',
    });
    expect(result).toHaveLength(1001);
    expect(result[0]?.product_name).toBe('Produto fora do catálogo carregado');
    expect(chain.gt).toHaveBeenCalledTimes(2);
  });
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
        products: { name: 'Arroz' },
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
        products: { name: 'Arroz' },
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
        products: { name: 'Arroz' },
      },
    ];
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockResolvedValue({ data: rows, error: null });
    const access = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { id: 'unit' }, error: null }),
    };
    access.select.mockReturnValue(access);
    access.eq.mockReturnValue(access);
    const client = {
      from: vi.fn((table: string) =>
        table === 'establishments' ? access : chain,
      ),
    } as unknown as SupabaseClient;

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
