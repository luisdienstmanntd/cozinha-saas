import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BatchPanel } from './BatchPanel';
import { containerRow, fakeContainers } from '../../../test/fakeContainers';

// D-073 (etapa 2): porções e derivados têm "Ver movimentações" e saída no próprio recipiente.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

const scope = { organizationId: 'org', establishmentId: 'unit' };
const integralId = '12345678-1234-4234-8234-000000000011';
const derivedId = '12345678-1234-4234-8234-000000000012';
const batchId = '22345678-1234-4234-8234-000000000011';

it('o derivado abre o histórico do próprio recipiente e grava nele', async () => {
  const user = userEvent.setup();
  const containers = fakeContainers([
    containerRow({
      container_id: integralId,
      batch_id: batchId,
      product_name: 'Peito de peru',
      unit: 'g',
      initial_quantity: 1000,
      balance: 750,
      expiry_date: '2026-01-15',
    }),
    containerRow({
      container_id: derivedId,
      batch_id: batchId,
      kind: 'derived',
      parent_container_id: integralId,
      expiry_origin: 'handling',
      product_name: 'Peito de peru',
      unit: 'g',
      initial_quantity: 250,
      balance: 250,
      expiry_date: '2026-01-05',
    }),
  ]);
  const list = vi.fn().mockResolvedValue([]);
  const record = vi.fn().mockResolvedValue('evento');
  render(
    <BatchPanel
      scope={scope}
      timezone="UTC"
      userId="user"
      canCreate
      catalog={{
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        setStorageCondition: vi.fn(),
      }}
      batches={{ list: vi.fn(), receive: vi.fn() }}
      containers={containers}
      movements={{ list, record }}
    />,
  );
  const items = within(
    await screen.findByRole('list', { name: 'Recipientes e validade' }),
  ).getAllByRole('listitem');
  const derived = items.find((item) =>
    item.textContent?.includes('(derivado)'),
  )!;
  const integral = items.find((item) => item !== derived)!;
  expect(
    within(integral).getByRole('button', { name: 'Ver movimentações' }),
  ).toBeInTheDocument();
  await user.click(
    within(derived).getByRole('button', { name: 'Ver movimentações' }),
  );
  expect(
    await within(derived).findByText('Saldo registrado: 250 g'),
  ).toBeVisible();
  expect(list).toHaveBeenCalledWith(scope, batchId, derivedId);
  await user.type(within(derived).getByLabelText('Quantidade da saída'), '250');
  await user.click(
    within(derived).getByRole('button', { name: 'Registrar saída' }),
  );
  await user.click(
    within(derived).getByRole('button', { name: 'Confirmar saída' }),
  );
  expect(record).toHaveBeenCalledTimes(1);
  expect(record.mock.calls[0]?.[1]).toMatchObject({
    batchId,
    containerId: derivedId,
    quantity: '250',
  });
});
