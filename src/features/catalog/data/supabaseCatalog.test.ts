import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCatalogGateway } from './supabaseCatalog';

const scope = { organizationId: 'org', establishmentId: 'unit' };

function clientFor({
  rows = [],
  queryError = null,
  establishment = { id: 'unit' },
  accessError = null,
}: {
  rows?: unknown[];
  queryError?: unknown;
  establishment?: unknown;
  accessError?: unknown;
} = {}) {
  const catalog = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue({ data: rows, error: queryError }),
  };
  catalog.select.mockReturnValue(catalog);
  catalog.eq.mockReturnValue(catalog);
  const access = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: establishment, error: accessError }),
  };
  access.select.mockReturnValue(access);
  access.eq.mockReturnValue(access);
  const from = vi.fn((table: string) =>
    table === 'establishments' ? access : catalog,
  );
  return {
    client: { from } as unknown as SupabaseClient,
    from,
    catalog,
    access,
  };
}

describe('consulta do catálogo por unidade', () => {
  it.each(['products', 'suppliers', 'preparations'] as const)(
    'mantém a lista vazia de %s quando a unidade está acessível',
    async (kind) => {
      const mock = clientFor();
      await expect(
        createCatalogGateway(mock.client).list(kind, scope),
      ).resolves.toEqual([]);
      expect(mock.from).toHaveBeenCalledWith('establishments');
      expect(mock.access.eq).toHaveBeenCalledWith('organization_id', 'org');
      expect(mock.access.eq).toHaveBeenCalledWith('id', 'unit');
    },
  );

  it.each(['products', 'suppliers'] as const)(
    'não trata %s vazio por falta de acesso como catálogo vazio',
    async (kind) => {
      const mock = clientFor({ establishment: null });
      const error = await createCatalogGateway(mock.client)
        .list(kind, scope)
        .catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'Acesso ao estabelecimento indisponível; a consulta não foi exibida.',
      );
      expect((error as Error).message).not.toContain('unit');
      /*
       * RLS filtering produces a successful empty SELECT. The gateway must verify
       * establishment visibility before deciding that empty means no records.
       */
      expect(mock.from).toHaveBeenCalledWith('establishments');
      expect(mock.access.maybeSingle).toHaveBeenCalledTimes(1);
    },
  );

  it('trata falha na verificação do estabelecimento como acesso indisponível', async () => {
    const mock = clientFor({ accessError: { message: 'permission denied' } });
    await expect(
      createCatalogGateway(mock.client).list('products', scope),
    ).rejects.toThrow('Acesso ao estabelecimento indisponível');
  });

  it('não consulta visibilidade quando o catálogo tem itens', async () => {
    const mock = clientFor({
      rows: [
        {
          id: '10000000-0000-4000-8000-000000000001',
          name: 'Arroz',
          unit: 'kg',
          storage_condition: 'ambient',
        },
      ],
    });
    await expect(
      createCatalogGateway(mock.client).list('products', scope),
    ).resolves.toHaveLength(1);
    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.from).not.toHaveBeenCalledWith('establishments');
  });

  it('mantém como erro uma falha na consulta do catálogo', async () => {
    const mock = clientFor({ queryError: { message: 'offline' } });
    await expect(
      createCatalogGateway(mock.client).list('products', scope),
    ).rejects.toThrow(
      'Não foi possível consultar o catálogo. Confira seu acesso e tente novamente.',
    );
    expect(mock.from).toHaveBeenCalledTimes(1);
  });
});

it('lê contatos aceitos pelo banco sem bloquear o catálogo por validação mais estrita de entrada', async () => {
  const row = {
    id: '12345678-1234-4234-8234-123456789abc',
    name: 'Fornecedor',
    email: 'a@b.c',
    contact: '+55 0011',
  };
  const mock = clientFor({ rows: [row] });
  await expect(
    createCatalogGateway(mock.client).list('suppliers', scope),
  ).resolves.toEqual([row]);
  expect(mock.catalog.select).toHaveBeenCalledWith('id,name,email,contact');
});
