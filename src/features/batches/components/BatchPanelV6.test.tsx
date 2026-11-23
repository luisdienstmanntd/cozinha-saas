import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { BatchPanel } from './BatchPanel';
import { containerRow, fakeContainers } from '../../../test/fakeContainers';
import { CONTAINER_PAGE_SIZE } from '../domain/container';
import { MAX_CONTAINER_ID, type ExpiryFilter } from '../domain/expiryFilter';

// V6 (D-072): os contadores filtram a lista pelo servidor (cursor no começo da categoria) e cortam o fim.
// Data de referência fixa: 31/12/2026 em UTC, para cruzar a virada do ano.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-31T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

const scope = { organizationId: 'org', establishmentId: 'unit' };
const catalog = () => ({
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  setStorageCondition: vi.fn(),
});
const batches = () => ({ list: vi.fn(), receive: vi.fn() });

function rows() {
  return [
    containerRow({ product_name: 'Arroz vencido', expiry_date: '2026-12-29' }),
    containerRow({ product_name: 'Feijão vencido', expiry_date: '2026-12-30' }),
    containerRow({ product_name: 'Leite hoje', expiry_date: '2026-12-31' }),
    containerRow({ product_name: 'Queijo amanhã', expiry_date: '2027-01-01' }),
    containerRow({ product_name: 'Farinha depois', expiry_date: '2027-01-15' }),
    containerRow({
      product_name: 'Sal esgotado',
      expiry_date: '2026-12-31',
      balance: 0,
    }),
  ];
}

function panel(containers: ReturnType<typeof fakeContainers>, extra = {}) {
  return (
    <BatchPanel
      scope={scope}
      timezone="UTC"
      userId="user"
      canCreate={false}
      catalog={catalog()}
      batches={batches()}
      containers={containers}
      {...extra}
    />
  );
}

async function listText() {
  return (await screen.findByRole('list', { name: 'Recipientes e validade' }))
    .textContent;
}

it('cada contador filtra a lista a partir do servidor, e tocar de novo volta à lista completa', async () => {
  const containers = fakeContainers(rows());
  const user = userEvent.setup();
  render(panel(containers));
  const summary = await screen.findByRole('group', {
    name: 'Resumo de validade',
  });
  expect(summary).toHaveTextContent(
    'Vencidos: 2 Vence hoje: 1 Vence amanhã: 1 Posteriores: 1',
  );
  for (const button of within(summary).getAllByRole('button'))
    expect(button).toHaveAttribute('aria-pressed', 'false');

  await user.click(within(summary).getByRole('button', { name: /Vence hoje/ }));
  expect(
    within(summary).getByRole('button', { name: /Vence hoje/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText(/Mostrando: Vence hoje \(1 com saldo/)).toBeVisible();
  const text = await listText();
  expect(text).toContain('Leite hoje');
  expect(text).not.toContain('Queijo amanhã');
  expect(text).not.toContain('Feijão vencido');
  expect(text).not.toContain('Sal esgotado');
  expect(containers.list).toHaveBeenLastCalledWith(scope, {
    includeDepleted: false,
    search: '',
    after: { expiryDate: '2026-12-30', id: MAX_CONTAINER_ID },
  });

  // Amanhã atravessa o ano: começa depois de 31/12 e termina em 01/01/2027.
  await user.click(
    within(summary).getByRole('button', { name: /Vence amanhã/ }),
  );
  expect(containers.list).toHaveBeenLastCalledWith(scope, {
    includeDepleted: false,
    search: '',
    after: { expiryDate: '2026-12-31', id: MAX_CONTAINER_ID },
  });
  await vi.waitFor(async () => {
    const shown = await listText();
    expect(shown).toContain('Queijo amanhã');
    expect(shown).not.toContain('Leite hoje');
    expect(shown).not.toContain('Farinha depois');
  });

  await user.click(within(summary).getByRole('button', { name: /Vencidos/ }));
  expect(containers.list).toHaveBeenLastCalledWith(scope, {
    includeDepleted: false,
    search: '',
    after: null,
  });
  await vi.waitFor(async () => {
    const shown = await listText();
    expect(shown).toContain('Arroz vencido');
    expect(shown).toContain('Feijão vencido');
    expect(shown).not.toContain('Leite hoje');
  });

  await user.click(
    within(summary).getByRole('button', { name: /Posteriores/ }),
  );
  await vi.waitFor(async () => {
    const shown = await listText();
    expect(shown).toContain('Farinha depois');
    expect(shown).not.toContain('Queijo amanhã');
  });

  // Tocar no contador escolhido volta à lista completa.
  await user.click(
    within(summary).getByRole('button', { name: /Posteriores/ }),
  );
  expect(
    within(summary).getByRole('button', { name: /Posteriores/ }),
  ).toHaveAttribute('aria-pressed', 'false');
  expect(screen.queryByText(/Mostrando:/)).not.toBeInTheDocument();
  await vi.waitFor(async () => {
    const shown = await listText();
    for (const name of [
      'Arroz vencido',
      'Leite hoje',
      'Queijo amanhã',
      'Farinha depois',
    ])
      expect(shown).toContain(name);
  });
});

it('"Limpar filtro" volta à lista completa e a busca atua dentro da categoria', async () => {
  const containers = fakeContainers(rows());
  const user = userEvent.setup();
  render(panel(containers));
  const summary = await screen.findByRole('group', {
    name: 'Resumo de validade',
  });
  await user.click(within(summary).getByRole('button', { name: /Vencidos/ }));
  await user.type(
    screen.getByRole('searchbox', {
      name: 'Buscar por produto, lote, código ou ID do recipiente',
    }),
    'feijão',
  );
  await vi.waitFor(() =>
    expect(containers.list).toHaveBeenLastCalledWith(scope, {
      includeDepleted: false,
      search: 'feijão',
      after: null,
    }),
  );
  await vi.waitFor(async () => {
    const shown = await listText();
    expect(shown).toContain('Feijão vencido');
    expect(shown).not.toContain('Arroz vencido');
  });
  expect(
    screen.getByText(/com a busca aplicada dentro do filtro/),
  ).toBeVisible();
  // As contagens continuam sendo da unidade, não da busca.
  expect(summary).toHaveTextContent('Vencidos: 2');

  await user.clear(screen.getByRole('searchbox'));
  await user.type(screen.getByRole('searchbox'), 'leite');
  expect(
    await screen.findByText(
      'Nenhum recipiente desta categoria corresponde à busca.',
    ),
  ).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Limpar filtro' }));
  await vi.waitFor(async () => {
    expect(await listText()).toContain('Leite hoje');
  });
  for (const button of within(summary).getAllByRole('button'))
    expect(button).toHaveAttribute('aria-pressed', 'false');
});

it('categoria sem recipientes mostra o vazio da categoria, sem o passo a passo da unidade', async () => {
  const containers = fakeContainers(
    rows().filter((row) => row.expiry_date !== '2027-01-01'),
  );
  const user = userEvent.setup();
  render(panel(containers));
  const summary = await screen.findByRole('group', {
    name: 'Resumo de validade',
  });
  await user.click(
    within(summary).getByRole('button', { name: /Vence amanhã/ }),
  );
  expect(
    await screen.findByText('Nenhum recipiente com saldo nesta categoria.'),
  ).toBeVisible();
  expect(
    screen.queryByText('Nenhum recipiente com saldo.'),
  ).not.toBeInTheDocument();
});

it('mostrar esgotados limpa o filtro, e escolher um filtro esconde os esgotados', async () => {
  const containers = fakeContainers(rows());
  const user = userEvent.setup();
  render(panel(containers));
  const summary = await screen.findByRole('group', {
    name: 'Resumo de validade',
  });
  const depleted = screen.getByRole('checkbox', { name: 'Mostrar esgotados' });
  await user.click(depleted);
  await vi.waitFor(async () =>
    expect(await listText()).toContain('Sal esgotado'),
  );

  await user.click(within(summary).getByRole('button', { name: /Vence hoje/ }));
  expect(depleted).not.toBeChecked();
  await vi.waitFor(async () => {
    const shown = await listText();
    expect(shown).toContain('Leite hoje');
    expect(shown).not.toContain('Sal esgotado');
  });

  await user.click(depleted);
  expect(depleted).toBeChecked();
  expect(
    within(summary).getByRole('button', { name: /Vence hoje/ }),
  ).toHaveAttribute('aria-pressed', 'false');
  await vi.waitFor(async () => {
    const shown = await listText();
    expect(shown).toContain('Sal esgotado');
    expect(shown).toContain('Queijo amanhã');
  });
});

it('carrega mais páginas dentro da categoria e para na fronteira', async () => {
  const today = Array.from({ length: CONTAINER_PAGE_SIZE + 3 }, () =>
    containerRow({ product_name: 'Iogurte hoje', expiry_date: '2026-12-31' }),
  );
  const containers = fakeContainers([
    containerRow({ product_name: 'Pão vencido', expiry_date: '2026-12-01' }),
    ...today,
    containerRow({
      product_name: 'Manteiga amanhã',
      expiry_date: '2027-01-01',
    }),
  ]);
  const user = userEvent.setup();
  render(panel(containers));
  const summary = await screen.findByRole('group', {
    name: 'Resumo de validade',
  });
  await user.click(within(summary).getByRole('button', { name: /Vence hoje/ }));
  await vi.waitFor(() =>
    expect(
      within(
        screen.getByRole('list', { name: 'Recipientes e validade' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(CONTAINER_PAGE_SIZE),
  );
  await user.click(
    screen.getByRole('button', { name: 'Carregar mais recipientes' }),
  );
  await vi.waitFor(() =>
    expect(
      within(
        screen.getByRole('list', { name: 'Recipientes e validade' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(CONTAINER_PAGE_SIZE + 3),
  );
  const shown = await listText();
  expect(shown).not.toContain('Manteiga amanhã');
  expect(shown).not.toContain('Pão vencido');
  expect(
    screen.queryByRole('button', { name: 'Carregar mais recipientes' }),
  ).not.toBeInTheDocument();
});

it('controlado de fora: segue o filtro recebido e avisa a escolha sem mudar sozinho', async () => {
  const containers = fakeContainers(rows());
  const user = userEvent.setup();
  const chosen: (ExpiryFilter | null)[] = [];
  function Host() {
    const [filter, setFilter] = useState<ExpiryFilter | null>('amanha');
    return panel(containers, {
      expiryFilter: filter,
      onExpiryFilter: (next: ExpiryFilter | null) => {
        chosen.push(next);
        setFilter(next);
      },
    });
  }
  render(<Host />);
  await vi.waitFor(async () => {
    const shown = await listText();
    expect(shown).toContain('Queijo amanhã');
    expect(shown).not.toContain('Leite hoje');
  });
  const summary = screen.getByRole('group', { name: 'Resumo de validade' });
  await user.click(within(summary).getByRole('button', { name: /Vencidos/ }));
  expect(chosen).toEqual(['vencidos']);
  await user.click(screen.getByRole('button', { name: 'Limpar filtro' }));
  expect(chosen).toEqual(['vencidos', null]);
});
