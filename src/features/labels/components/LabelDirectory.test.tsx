import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { LabelDirectory } from './LabelDirectory';
import type { ContainerRow } from '../../batches/domain/container';
import { localCivilDate } from '../../batches/domain/expiryStatus';
import { fakeContainers } from '../../../test/fakeContainers';

const timezone = 'America/Sao_Paulo';
const civil = (offset: number) =>
  localCivilDate(new Date(Date.now() + offset * 86_400_000), timezone);

function row(
  n: number,
  name: string,
  offset: number,
  balance: number,
): ContainerRow {
  return {
    container_id: `40000000-0000-4000-8000-00000000000${n}`,
    short_code: `C-00000${n}`,
    kind: 'integral',
    parent_container_id: null,
    batch_id: '50000000-0000-4000-8000-000000000001',
    product_id: '60000000-0000-4000-8000-000000000001',
    product_name: name,
    unit: 'kg',
    source_code: null,
    expiry_date: civil(offset),
    expiry_origin: 'receipt',
    batch_expiry_origin: 'original',
    initial_quantity: 10,
    balance,
    timezone,
    created_at: '2026-11-20T12:00:00.000Z',
  };
}

const rows = [
  row(1, 'Arroz', 0, 4),
  row(2, 'Feijão', 3, 2.5),
  row(3, 'Molho', 1, 0),
];

function renderDirectory(list = rows) {
  const containers = fakeContainers(list);
  render(
    <LabelDirectory
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      containers={containers}
      revision={0}
    />,
  );
  return containers;
}

it('PR-07: por padrão só recipientes com saldo, com colunas Saldo e Situação', async () => {
  const containers = renderDirectory();
  const table = await screen.findByRole('table');
  expect(within(table).getByText('Arroz')).toBeVisible();
  expect(within(table).getByText('Feijão')).toBeVisible();
  expect(within(table).queryByText('Molho')).toBeNull();
  expect(
    within(table).getByRole('columnheader', { name: 'Saldo' }),
  ).toBeVisible();
  expect(
    within(table).getByRole('columnheader', { name: 'Situação' }),
  ).toBeVisible();
  expect(within(table).getByText('4 kg')).toBeVisible();
  expect(within(table).getByText('2,5 kg')).toBeVisible();
  expect(within(table).getByText('Vence hoje')).toBeVisible();
  expect(within(table).getByText('Vence em 3 dias')).toBeVisible();
  expect(containers.list).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ includeDepleted: false }),
  );
});

it('PR-07: desmarcar "Só com saldo" mostra o esgotado como Esgotado', async () => {
  renderDirectory();
  await screen.findByRole('table');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Só com saldo' }));
  const sold = await screen.findByText('Molho');
  const line = sold.closest('tr')!;
  expect(within(line).getByText('Esgotado')).toBeVisible();
  expect(within(line).getByText('0 kg')).toBeVisible();
  expect(
    within(line).getByRole('link', { name: 'Abrir ficha' }),
  ).toHaveAttribute('href', expect.stringContaining('40000000-0000-4000'));
});

it('PR-07: a busca acontece ao digitar, sem o botão, e Enter consulta na hora', async () => {
  const containers = renderDirectory();
  await screen.findByRole('table');
  await userEvent.type(
    screen.getByLabelText(/Produto, lote ou código/),
    'feij',
  );
  await waitFor(
    () =>
      expect(containers.list).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ search: 'feij' }),
      ),
    { timeout: 2000 },
  );
  expect(await screen.findByText('Feijão')).toBeVisible();
  expect(screen.queryByText('Arroz')).toBeNull();
  const before = containers.list.mock.calls.length;
  await userEvent.type(
    screen.getByLabelText(/Produto, lote ou código/),
    'x{Enter}',
  );
  await waitFor(() =>
    expect(containers.list.mock.calls.length).toBeGreaterThan(before),
  );
  expect(containers.list).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ search: 'feijx' }),
  );
});

it('PR-07: lista vazia com o filtro ligado diz como ver os esgotados', async () => {
  renderDirectory([row(3, 'Molho', 1, 0)]);
  expect(
    await screen.findByText(/Nenhum recipiente com saldo encontrado/),
  ).toBeVisible();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Só com saldo' }));
  expect(await screen.findByText('Molho')).toBeVisible();
});

it('PR-07: falha da consulta mostra alerta com repetição, sem lista', async () => {
  const containers = fakeContainers([]);
  containers.list.mockRejectedValueOnce(new Error('falha'));
  render(
    <LabelDirectory
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      containers={containers}
      revision={0}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Falha ao consultar etiquetas.',
  );
  expect(screen.queryByRole('table')).toBeNull();
  await userEvent.click(
    screen.getByRole('button', { name: 'Tentar novamente' }),
  );
  expect(
    await screen.findByText('Nenhum recipiente com saldo encontrado.', {
      exact: false,
    }),
  ).toBeVisible();
});

it('PR-11: clique simples abre a ficha na unidade; Ctrl+clique e a falta de manipulador mantêm o link comum', async () => {
  const containers = fakeContainers(rows);
  const open = vi.fn();
  const view = render(
    <LabelDirectory
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      containers={containers}
      revision={0}
      fichaHref={(id) => `/?unidade=u&area=etiquetas&recipiente=${id}`}
      onOpenFicha={open}
    />,
  );
  const link = (
    await screen.findAllByRole('link', { name: 'Abrir ficha' })
  )[0]!;
  expect(link).toHaveAttribute(
    'href',
    expect.stringContaining('area=etiquetas&recipiente=40000000-0000-4000'),
  );
  await userEvent.click(link);
  expect(open).toHaveBeenCalledWith(
    expect.stringMatching(/^40000000-0000-4000/),
  );
  open.mockClear();
  fireEvent.click(link, { ctrlKey: true });
  expect(open).not.toHaveBeenCalled();
  view.unmount();
  // Sem manipulador, o link segue para a rota do QR, como antes.
  renderDirectory();
  const plain = (
    await screen.findAllByRole('link', { name: 'Abrir ficha' })
  )[0]!;
  expect(plain).toHaveAttribute(
    'href',
    expect.stringMatching(/^\/recipiente\/40000000-0000-4000/),
  );
});
