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

it('oculta a ficha aberta quando a releitura dos recebimentos perde autorização', async () => {
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
  const labels = {
    ensure: vi.fn().mockResolvedValue(id),
    get: vi.fn().mockResolvedValue(data),
  };
  const panel = (reloadToken: number) => (
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="UTC"
      userId="user"
      canCreate
      catalog={{
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        setStorageCondition: vi.fn(),
      }}
      batches={batches()}
      containers={containers}
      labels={labels}
      reloadToken={reloadToken}
    />
  );
  const { rerender } = render(panel(0));
  await user.click(await screen.findByRole('button', { name: 'Ver ficha' }));
  expect(
    await screen.findByRole('region', { name: 'Recipiente' }),
  ).toBeVisible();
  // V3: a ficha abre direto pelo recipiente da lista, sem gravar nada (ensure não é chamado).
  expect(labels.get).toHaveBeenCalledWith(id);
  expect(labels.ensure).not.toHaveBeenCalled();
  containers.list.mockRejectedValueOnce(new Error('sem acesso'));
  // Releitura disparada de fora (tentativa pendente resolvida, produção registrada).
  rerender(panel(1));
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
        catalog={{
          list: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          setStorageCondition: vi.fn(),
        }}
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
      catalog={{
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        setStorageCondition: vi.fn(),
      }}
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
    .map((item) => item.getAttribute('aria-labelledby'));
  expect(new Set(shown).size).toBe(CONTAINER_PAGE_SIZE + 5);
});

it('informa erro se não conseguir interpretar o fuso da unidade', async () => {
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="Inválido/Fuso"
      userId="user"
      canCreate={false}
      catalog={{
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        setStorageCondition: vi.fn(),
      }}
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
          catalog={{
            list: vi.fn().mockResolvedValue([]),
            create: vi.fn(),
            setStorageCondition: vi.fn(),
          }}
          batches={batches()}
          containers={containers}
        />,
      );
    });
    const summary = screen.getByRole('group', { name: 'Resumo de validade' });
    expect(summary).toHaveTextContent('Vencidos: 0 Vence hoje: 1');
    expect(screen.getByText('Vence hoje')).toBeVisible();
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(summary).toHaveTextContent('Vencidos: 1 Vence hoje: 0');
    expect(screen.getByText('Vencido há 1 dia')).toBeVisible();
    expect(screen.queryByText('Vence hoje')).not.toBeInTheDocument();
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
      catalog={{
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        setStorageCondition: vi.fn(),
      }}
      batches={batches()}
      containers={containers}
    />,
  );
  await user.type(await screen.findByRole('searchbox'), 'distante');
  await vi.waitFor(() =>
    expect(screen.getAllByRole('listitem')).toHaveLength(1),
  );
  const card = screen.getByRole('listitem', { name: /Produto distante C-\d+/ });
  expect(card).toBeVisible();
  expect(card).toHaveTextContent('· lote L1');
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
      catalog={{
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        setStorageCondition: vi.fn(),
      }}
      batches={batches()}
      containers={fakeContainers(rows)}
    />,
  );

  const dashboard = await screen.findByRole('region', {
    name: 'Painel de validade',
  });
  const summary = within(dashboard).getByRole('group', {
    name: 'Resumo de validade',
  });
  expect(summary).toBeVisible();
  expect(summary).toHaveTextContent(
    'Vencidos: 1 Vence hoje: 1 Vence amanhã: 1 Posteriores: 0',
  );
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
  // V3: a busca pelo identificador continua no servidor, mas o UUID não aparece no cartão.
  expect(
    await screen.findByRole('listitem', { name: /^Arroz C-\d+/ }),
  ).toBeVisible();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.queryByText(/30000000-0000/)).not.toBeInTheDocument();
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
      catalog={{
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        setStorageCondition: vi.fn(),
      }}
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
      .map((item) => item.querySelector('.card-product')?.textContent);
  expect(names()).toEqual(['Frango', 'Queijo', 'Leite']);
  const card = (name: string) =>
    within(list()).getByRole('listitem', { name: new RegExp(`^${name} `) });
  expect(card('Queijo')).toHaveTextContent('Saldo 1,5 kg de 2,5 kg');
  expect(card('Leite')).toHaveTextContent('Saldo 8 un de 12 un');
  const summary = () =>
    screen.getByRole('group', { name: 'Resumo de validade' });
  expect(summary()).toHaveTextContent('Vencidos: 1 Vence hoje: 0');
  await user.click(screen.getByRole('checkbox', { name: 'Mostrar esgotados' }));
  await vi.waitFor(() =>
    expect(names()).toEqual(['Frango', 'Creme', 'Queijo', 'Leite']),
  );
  expect(card('Creme')).toHaveTextContent('Saldo 0 un de 6 un');
  expect(card('Creme')).toHaveTextContent('Esgotado');
  expect(summary()).toHaveTextContent('Vencidos: 1 Vence hoje: 0');
});

it('linha vencida com saldo mostra a faixa e não oferece manipular nem consumir (fatia 6.11)', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    // 02:30 UTC de 02/01 ainda é 01/01 em São Paulo: 31/12 venceu, 01/01 vence hoje.
    vi.setSystemTime(new Date('2026-01-02T02:30:00Z'));
    const user = userEvent.setup();
    const expiredId = '12345678-1234-4234-8234-000000000001';
    const todayId = '12345678-1234-4234-8234-000000000002';
    const containers = fakeContainers([
      containerRow({
        container_id: expiredId,
        product_name: 'Arroz',
        expiry_date: '2025-12-31',
      }),
      containerRow({
        container_id: todayId,
        product_name: 'Feijão',
        expiry_date: '2026-01-01',
      }),
    ]);
    render(
      <BatchPanel
        scope={{ organizationId: 'org', establishmentId: 'unit' }}
        timezone="America/Sao_Paulo"
        userId="user"
        canCreate
        catalog={{
          list: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          setStorageCondition: vi.fn(),
        }}
        batches={batches()}
        containers={containers}
        movements={{
          list: vi.fn().mockResolvedValue([]),
          record: vi.fn(),
        }}
        handling={
          {} as unknown as NonNullable<
            Parameters<typeof BatchPanel>[0]['handling']
          >
        }
      />,
    );
    const list = await screen.findByRole('list', {
      name: 'Recipientes e validade',
    });
    const items = within(list).getAllByRole('listitem');
    const expiredRow = items[0]!;
    const todayRow = items[1]!;
    expect(
      within(expiredRow).getByText(/VENCIDO - somente descarte/),
    ).toBeVisible();
    expect(
      within(expiredRow).queryByRole('button', { name: 'Abrir / porcionar' }),
    ).not.toBeInTheDocument();
    expect(
      within(expiredRow).getByText(/Manipulação indisponível: validade passou/),
    ).toBeVisible();
    expect(within(todayRow).queryByText(/VENCIDO/)).not.toBeInTheDocument();
    expect(
      within(todayRow).getByRole('button', { name: 'Abrir / porcionar' }),
    ).toBeVisible();
    await user.click(
      within(expiredRow).getByRole('button', { name: 'Ver movimentações' }),
    );
    const kind = await within(expiredRow).findByLabelText('Tipo de saída');
    expect(
      within(kind).queryByRole('option', { name: 'Consumo' }),
    ).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
