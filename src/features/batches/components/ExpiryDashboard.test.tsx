import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BatchPanel } from './BatchPanel';

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
