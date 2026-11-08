import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BatchPanel } from './BatchPanel';

it('informa o limite de volume sem apresentar um painel parcial', async () => {
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="UTC"
      userId="user"
      canCreate={false}
      catalog={{ list: vi.fn().mockResolvedValue([]), create: vi.fn() }}
      batches={{
        list: vi
          .fn()
          .mockRejectedValue(
            new Error(
              'O limite de 10.000 recebimentos foi excedido; a consulta não foi exibida.',
            ),
          ),
        receive: vi.fn(),
      }}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'O limite de 10.000 recebimentos foi excedido',
  );
  expect(
    screen.queryByRole('region', { name: 'Painel de validade' }),
  ).not.toBeInTheDocument();
});

it('informa erro se não conseguir interpretar o fuso da unidade', async () => {
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="Inválido/Fuso"
      userId="user"
      canCreate={false}
      catalog={{ list: vi.fn().mockResolvedValue([]), create: vi.fn() }}
      batches={{ list: vi.fn().mockResolvedValue([]), receive: vi.fn() }}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível interpretar o fuso',
  );
  expect(
    screen.queryByText('Nenhum recebimento registrado.'),
  ).not.toBeInTheDocument();
});

it('atualiza a classificação na virada do dia da cozinha sem interação', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-01-01T02:59:30Z'));
    const rows = [
      {
        id: '20000000-0000-4000-8000-000000000001',
        product_id: '10000000-0000-4000-8000-000000000001',
        product_name: 'Arroz',
        source_code: 'L1',
        quantity: 1,
        unit: 'kg',
        expiry_date: '2025-12-31',
        expiry_origin: 'original' as const,
        container_id: null,
      },
    ];
    const catalog = { list: vi.fn().mockResolvedValue([]), create: vi.fn() };
    const batches = { list: vi.fn().mockResolvedValue(rows), receive: vi.fn() };
    await act(async () => {
      render(
        <BatchPanel
          scope={{ organizationId: 'org', establishmentId: 'unit' }}
          timezone="America/Sao_Paulo"
          userId="user"
          canCreate={false}
          catalog={catalog}
          batches={batches}
        />,
      );
    });
    expect(screen.getByText(/Vence hoje: 1/)).toBeVisible();
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText(/Vencidos: 1/)).toBeVisible();
  } finally {
    vi.useRealTimers();
  }
});

it('busca pelo nome do produto associado mesmo fora da lista de catálogo', async () => {
  const row = {
    id: '20000000-0000-4000-8000-000000000001',
    product_id: '10000000-0000-4000-8000-000000000001',
    product_name: 'Produto distante',
    source_code: 'L1',
    quantity: 1,
    unit: 'kg',
    expiry_date: '2026-01-01',
    expiry_origin: 'original' as const,
    container_id: null,
  };
  const user = userEvent.setup();
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="UTC"
      userId="user"
      canCreate={false}
      catalog={{ list: vi.fn().mockResolvedValue([]), create: vi.fn() }}
      batches={{ list: vi.fn().mockResolvedValue([row]), receive: vi.fn() }}
    />,
  );
  await user.type(await screen.findByRole('searchbox'), 'distante');
  expect(screen.getByText(/Produto distante — lote L1/)).toBeVisible();
});

function dateOffset(offset: number) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((parts, part) => {
      if (part.type !== 'literal') parts[part.type] = part.value;
      return parts;
    }, {});
  const date = new Date(
    `${today.year}-${today.month}-${today.day}T00:00:00.000Z`,
  );
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

it('mostra o resumo de validade e busca produto, lote e recipiente', async () => {
  const products = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Arroz',
      unit: 'kg' as const,
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      name: 'Feijão',
      unit: 'kg' as const,
    },
  ];
  const rows = [
    {
      id: '20000000-0000-4000-8000-000000000001',
      product_id: products[0]!.id,
      source_code: 'LOTE-ARROZ',
      quantity: 2,
      unit: 'kg',
      expiry_date: dateOffset(0),
      expiry_origin: 'original' as const,
      container_id: '30000000-0000-4000-8000-000000000001',
    },
    {
      id: '20000000-0000-4000-8000-000000000002',
      product_id: products[1]!.id,
      source_code: 'LOTE-FEIJÃO',
      quantity: 1,
      unit: 'kg',
      expiry_date: dateOffset(1),
      expiry_origin: 'responsible' as const,
      container_id: null,
    },
    {
      id: '20000000-0000-4000-8000-000000000003',
      product_id: products[1]!.id,
      source_code: 'LOTE-VENCIDO',
      quantity: 3,
      unit: 'kg',
      expiry_date: dateOffset(-1),
      expiry_origin: 'original' as const,
      container_id: null,
    },
  ];
  const catalog = {
    list: vi.fn(async (kind: string) => (kind === 'products' ? products : [])),
    create: vi.fn(),
  };
  const batches = {
    list: vi.fn().mockResolvedValue(rows),
    receive: vi.fn(),
  };
  const user = userEvent.setup();
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="America/Sao_Paulo"
      canCreate={false}
      userId="user"
      catalog={catalog}
      batches={batches}
    />,
  );

  const dashboard = await screen.findByRole('region', {
    name: 'Painel de validade',
  });
  expect(
    await within(dashboard).findByText((text) =>
      text.includes('Vence hoje: 1'),
    ),
  ).toBeVisible();
  expect(
    within(dashboard).getByText((text) => text.includes('Vence amanhã: 1')),
  ).toBeVisible();
  expect(
    within(dashboard).getByText((text) => text.includes('Vencidos: 1')),
  ).toBeVisible();
  const search = screen.getByRole('searchbox', {
    name: 'Buscar por produto, lote ou ID do recipiente',
  });
  await user.type(search, 'arroz');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  await user.clear(search);
  await user.type(search, 'LOTE-FEIJÃO');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText(/definida pelo responsável/)).toBeVisible();
  await user.clear(search);
  await user.type(search, '30000000-0000-4000-8000-000000000001');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(
    within(screen.getByRole('list')).getByText(/recipiente 30000000/),
  ).toBeVisible();
});
