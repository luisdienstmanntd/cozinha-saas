import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BatchPanel } from './BatchPanel';
import { containerRow, fakeContainers } from '../../../test/fakeContainers';
import { CONTAINER_PAGE_SIZE } from '../domain/container';

// Fatia 6.2: o painel lê recipientes com saldo do servidor (list_containers e container_expiry_summary).
// Os testes usam um servidor falso com a mesma regra; o comportamento no banco está em
// supabase/tests/list_containers.test.sql e tests/integration/list-containers.test.mjs.
const batches = () => ({ list: vi.fn(), receive: vi.fn() });

it('oculta etiqueta aberta quando atualizar recebimentos perde autorização', async () => {
  const id = '12345678-1234-4234-8234-123456789abc';
  const row = containerRow({ container_id: id, product_name: 'Arroz' });
  const data = {
    id,
    short_code: row.short_code,
    balance: 1,
    batch_receipts: {
      source_code: row.source_code,
      quantity: 1,
      unit: 'kg',
      expiry_date: '2026-01-01',
      expiry_origin: 'original' as const,
      products: { name: 'Arroz' },
    },
  };
  const containers = fakeContainers([row]);
  const user = userEvent.setup();
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="UTC"
      userId="user"
      canCreate
      catalog={{ list: vi.fn().mockResolvedValue([]), create: vi.fn() }}
      batches={batches()}
      containers={containers}
      labels={{
        ensure: vi.fn().mockResolvedValue(id),
        get: vi.fn().mockResolvedValue(data),
      }}
    />,
  );
  await user.click(
    await screen.findByRole('button', { name: 'Abrir etiqueta' }),
  );
  expect(
    await screen.findByRole('region', { name: 'Recipiente' }),
  ).toBeVisible();
  containers.list.mockRejectedValueOnce(new Error('sem acesso'));
  await user.click(
    await screen.findByRole('button', { name: 'Atualizar recebimentos' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível carregar todos',
  );
  expect(
    screen.queryByRole('region', { name: 'Recipiente' }),
  ).not.toBeInTheDocument();
});

// Antes da 6.2: "informa o limite de volume sem apresentar um painel parcial" (teto de 10.000 no
// navegador). O teto saiu por desenho (FASE_06_DESENHO 7.3); continua valendo que falha na consulta
// não deixa um painel parcial, inclusive quando só as contagens falham.
it('não apresenta painel parcial quando a lista ou as contagens falham', async () => {
  for (const failing of ['list', 'summary'] as const) {
    const containers = fakeContainers([containerRow()]);
    containers[failing].mockRejectedValue(new Error('falha'));
    const { unmount } = render(
      <BatchPanel
        scope={{ organizationId: 'org', establishmentId: 'unit' }}
        timezone="UTC"
        userId="user"
        canCreate={false}
        catalog={{ list: vi.fn().mockResolvedValue([]), create: vi.fn() }}
        batches={batches()}
        containers={containers}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar todos os recebimentos',
    );
    expect(
      screen.queryByRole('region', { name: 'Painel de validade' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    unmount();
  }
});

it('carrega a página seguinte a pedido, sem teto no navegador', async () => {
  const rows = Array.from({ length: CONTAINER_PAGE_SIZE + 5 }, (_, n) =>
    containerRow({
      expiry_date: `2026-02-${String((n % 28) + 1).padStart(2, '0')}`,
    }),
  );
  const containers = fakeContainers(rows);
  const user = userEvent.setup();
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="UTC"
      userId="user"
      canCreate={false}
      catalog={{ list: vi.fn().mockResolvedValue([]), create: vi.fn() }}
      batches={batches()}
      containers={containers}
    />,
  );
  const list = await screen.findByRole('list', {
    name: 'Recipientes e validade',
  });
  expect(within(list).getAllByRole('listitem')).toHaveLength(
    CONTAINER_PAGE_SIZE,
  );
  await user.click(
    screen.getByRole('button', { name: 'Carregar mais recipientes' }),
  );
  expect(
    await within(list)
      .findAllByRole('listitem')
      .then((items) => items.length),
  ).toBe(CONTAINER_PAGE_SIZE + 5);
  expect(
    screen.queryByRole('button', { name: 'Carregar mais recipientes' }),
  ).not.toBeInTheDocument();
  const shown = within(list)
    .getAllByRole('listitem')
    .map((item) => /recipiente (\S+)/.exec(item.textContent ?? '')?.[1]);
  expect(new Set(shown).size).toBe(CONTAINER_PAGE_SIZE + 5);
});

it('informa erro se não conseguir interpretar o fuso da unidade', async () => {
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="Inválido/Fuso"
      userId="user"
      canCreate={false}
      catalog={{ list: vi.fn().mockResolvedValue([]), create: vi.fn() }}
      batches={batches()}
      containers={fakeContainers([])}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível interpretar o fuso',
  );
  expect(
    screen.queryByText('Nenhum recipiente com saldo.'),
  ).not.toBeInTheDocument();
});

it('atualiza a classificação na virada do dia da cozinha sem interação', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-01-01T02:59:30Z'));
    const containers = fakeContainers([
      containerRow({ expiry_date: '2025-12-31' }),
    ]);
    await act(async () => {
      render(
        <BatchPanel
          scope={{ organizationId: 'org', establishmentId: 'unit' }}
          timezone="America/Sao_Paulo"
          userId="user"
          canCreate={false}
          catalog={{ list: vi.fn().mockResolvedValue([]), create: vi.fn() }}
          batches={batches()}
          containers={containers}
        />,
      );
    });
    expect(screen.getByText(/Vence hoje: 1/)).toBeVisible();
    expect(screen.getByText(/— Vence hoje —/)).toBeVisible();
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText(/Vencidos: 1/)).toBeVisible();
    expect(screen.getByText(/— Vencido —/)).toBeVisible();
    expect(containers.summary).toHaveBeenLastCalledWith(
      { organizationId: 'org', establishmentId: 'unit' },
      '2026-01-01',
    );
  } finally {
    vi.useRealTimers();
  }
});

it('busca no servidor pelo nome do produto associado mesmo fora da lista de catálogo', async () => {
  const containers = fakeContainers([
    containerRow({ product_name: 'Produto distante', source_code: 'L1' }),
    containerRow({ product_name: 'Outro' }),
  ]);
  const user = userEvent.setup();
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="UTC"
      userId="user"
      canCreate={false}
      catalog={{ list: vi.fn().mockResolvedValue([]), create: vi.fn() }}
      batches={batches()}
      containers={containers}
    />,
  );
  await user.type(await screen.findByRole('searchbox'), 'distante');
  await vi.waitFor(() =>
    expect(screen.getAllByRole('listitem')).toHaveLength(1),
  );
  expect(screen.getByText(/Produto distante — C-\d+ — lote L1/)).toBeVisible();
  expect(containers.list).toHaveBeenLastCalledWith(
    { organizationId: 'org', establishmentId: 'unit' },
    { includeDepleted: false, search: 'distante', after: null },
  );
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
  const rows = [
    containerRow({
      container_id: '30000000-0000-4000-8000-0000000000a1',
      product_name: 'Arroz',
      source_code: 'LOTE-ARROZ',
      initial_quantity: 2,
      balance: 2,
      expiry_date: dateOffset(0),
    }),
    containerRow({
      product_name: 'Feijão',
      source_code: 'LOTE-FEIJÃO',
      expiry_date: dateOffset(1),
      batch_expiry_origin: 'responsible',
    }),
    containerRow({
      product_name: 'Feijão',
      source_code: 'LOTE-VENCIDO',
      initial_quantity: 3,
      balance: 3,
      expiry_date: dateOffset(-1),
    }),
  ];
  const user = userEvent.setup();
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="America/Sao_Paulo"
      canCreate={false}
      userId="user"
      catalog={{ list: vi.fn().mockResolvedValue([]), create: vi.fn() }}
      batches={batches()}
      containers={fakeContainers(rows)}
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
    name: 'Buscar por produto, lote, código ou ID do recipiente',
  });
  await user.type(search, 'arroz');
  await vi.waitFor(() =>
    expect(screen.getAllByRole('listitem')).toHaveLength(1),
  );
  await user.clear(search);
  await user.type(search, 'LOTE-FEIJÃO');
  expect(await screen.findByText(/definida pelo responsável/)).toBeVisible();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  await user.clear(search);
  await user.type(search, '30000000-0000-4000-8000-0000000000a1');
  await vi.waitFor(() =>
    expect(screen.getAllByRole('listitem')).toHaveLength(1),
  );
  expect(
    within(screen.getByRole('list')).getByText(/recipiente 30000000/),
  ).toBeVisible();
});

it('ordena por validade, mostra saldo em vez da quantidade recebida e esconde esgotados', async () => {
  const rows = [
    containerRow({
      product_name: 'Leite',
      unit: 'un',
      initial_quantity: 12,
      balance: 8,
      expiry_date: dateOffset(5),
    }),
    containerRow({
      product_name: 'Frango',
      initial_quantity: 8,
      balance: 8,
      expiry_date: dateOffset(-2),
    }),
    containerRow({
      product_name: 'Creme',
      unit: 'un',
      initial_quantity: 6,
      balance: 0,
      expiry_date: dateOffset(0),
    }),
    containerRow({
      product_name: 'Queijo',
      initial_quantity: 2.5,
      balance: 1.5,
      expiry_date: dateOffset(1),
    }),
  ];
  const user = userEvent.setup();
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="America/Sao_Paulo"
      canCreate={false}
      userId="user"
      catalog={{ list: vi.fn().mockResolvedValue([]), create: vi.fn() }}
      batches={batches()}
      containers={fakeContainers(rows)}
    />,
  );
  await screen.findByRole('list', { name: 'Recipientes e validade' });
  const list = () =>
    screen.getByRole('list', { name: 'Recipientes e validade' });
  const names = () =>
    within(list())
      .getAllByRole('listitem')
      .map((item) => item.textContent?.split(' — ')[0]);
  expect(names()).toEqual(['Frango', 'Queijo', 'Leite']);
  expect(within(list()).getByText(/Queijo/)).toHaveTextContent(
    'saldo 1.5 kg de 2.5 kg',
  );
  expect(within(list()).getByText(/Leite/)).toHaveTextContent(
    'saldo 8 un de 12 un',
  );
  expect(screen.getByText(/Vencidos: 1 · Vence hoje: 0/)).toBeVisible();
  await user.click(screen.getByRole('checkbox', { name: 'Mostrar esgotados' }));
  await vi.waitFor(() =>
    expect(names()).toEqual(['Frango', 'Creme', 'Queijo', 'Leite']),
  );
  expect(within(list()).getByText(/Creme/)).toHaveTextContent(
    'saldo 0 un de 6 un',
  );
  expect(within(list()).getByText(/Creme/)).toHaveTextContent('Esgotado');
  expect(screen.getByText(/Vencidos: 1 · Vence hoje: 0/)).toBeVisible();
});
