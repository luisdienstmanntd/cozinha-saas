import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createContainerGateway } from './supabaseContainers';
import { CONTAINER_PAGE_SIZE } from '../domain/container';

const scope = { organizationId: 'org', establishmentId: 'unit' };
function row(n: number, balance = 1) {
  const id = String(n).padStart(12, '0');
  return {
    container_id: `30000000-0000-4000-8000-${id}`,
    short_code: `C-${String(n).padStart(6, '0')}`,
    kind: 'integral',
    parent_container_id: null,
    batch_id: `20000000-0000-4000-8000-${id}`,
    product_id: '10000000-0000-4000-8000-000000000001',
    product_name: 'Arroz',
    unit: 'kg',
    source_code: 'L',
    expiry_date: '2026-01-01',
    expiry_origin: 'receipt',
    batch_expiry_origin: 'original',
    initial_quantity: 2,
    balance,
    timezone: 'UTC',
    created_at: '2026-01-01T00:00:00+00:00',
  };
}
function client(rpc: ReturnType<typeof vi.fn>, access = true) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(
    access
      ? { data: { id: 'unit' }, error: null }
      : { data: null, error: null },
  );
  return {
    rpc,
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient;
}

describe('painel por recipiente (fatia 6.2)', () => {
  it('pede ao servidor só recipientes com saldo, com busca, cursor e uma linha a mais', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row(1)], error: null });
    const page = await createContainerGateway(client(rpc)).list(scope, {
      includeDepleted: false,
      search: '  arroz ',
      after: { expiryDate: '2025-12-31', id: row(9).container_id },
    });
    expect(rpc).toHaveBeenCalledWith('list_containers', {
      p_organization_id: 'org',
      p_establishment_id: 'unit',
      p_filter: 'with_balance',
      p_target_id: null,
      p_search: 'arroz',
      p_after_expiry: '2025-12-31',
      p_after_id: row(9).container_id,
      p_limit: CONTAINER_PAGE_SIZE + 1,
    });
    expect(page.rows).toHaveLength(1);
    expect(page.next).toBeNull();
  });
  it('mostra esgotados só quando pedido e devolve o cursor da próxima página', async () => {
    const rows = Array.from({ length: CONTAINER_PAGE_SIZE + 1 }, (_, n) =>
      row(n + 1, 0),
    );
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const page = await createContainerGateway(client(rpc)).list(scope, {
      includeDepleted: true,
      search: '',
      after: null,
    });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_filter: 'all',
      p_search: null,
    });
    expect(page.rows).toHaveLength(CONTAINER_PAGE_SIZE);
    expect(page.next).toEqual({
      expiryDate: '2026-01-01',
      id: rows[CONTAINER_PAGE_SIZE - 1]!.container_id,
    });
  });
  it('não apresenta lista vazia como resultado quando o acesso à unidade falta', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await expect(
      createContainerGateway(client(rpc, false)).list(scope, {
        includeDepleted: false,
        search: '',
        after: null,
      }),
    ).rejects.toThrow('Acesso ao estabelecimento indisponível');
    await expect(
      createContainerGateway(client(rpc, false)).summary(scope, '2026-01-01'),
    ).rejects.toThrow();
  });
  it('recusa resposta fora do formato e erro do servidor', async () => {
    const bad = vi
      .fn()
      .mockResolvedValue({ data: [{ ...row(1), balance: '1' }], error: null });
    await expect(
      createContainerGateway(client(bad)).list(scope, {
        includeDepleted: false,
        search: '',
        after: null,
      }),
    ).rejects.toThrow();
    const failing = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(
      createContainerGateway(client(failing)).get(scope, row(1).container_id),
    ).rejects.toThrow('Não foi possível consultar o recipiente.');
  });
  it('lê um recipiente pelo ID e as contagens pela data de referência', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [row(7, 0.5)], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [{ overdue: 1, due_today: 2, due_tomorrow: 3, later: 4 }],
        error: null,
      });
    const gateway = createContainerGateway(client(rpc));
    expect((await gateway.get(scope, row(7).container_id))?.balance).toBe(0.5);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_filter: 'container',
      p_target_id: row(7).container_id,
      p_limit: 1,
    });
    expect(await gateway.get(scope, row(8).container_id)).toBeNull();
    expect(await gateway.summary(scope, '2026-11-13')).toEqual({
      overdue: 1,
      due_today: 2,
      due_tomorrow: 3,
      later: 4,
    });
    expect(rpc).toHaveBeenLastCalledWith('container_expiry_summary', {
      p_organization_id: 'org',
      p_establishment_id: 'unit',
      p_reference_date: '2026-11-13',
    });
  });
});
