import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BatchPanel } from './BatchPanel';
import type { BatchGateway } from '../application/batchGateway';
import { fakeContainers } from '../../../test/fakeContainers';

it('mantém os dados quando o recebimento falha', async () => {
  sessionStorage.clear();
  // Fatia 6.2: a lista do painel vem de list_containers (servidor falso).
  const containers = fakeContainers([]);
  const product = {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Arroz',
    unit: 'kg' as const,
    storage_condition: 'ambient' as const,
  };
  const supplier = {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Horta',
  };
  const catalog = {
    list: vi.fn(async (kind: string) =>
      kind === 'products' ? [product] : [supplier],
    ),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
  };
  const batches = {
    list: vi.fn().mockResolvedValue([]),
    receive: vi.fn().mockRejectedValue(new Error('Falha ao gravar.')),
  };
  const user = userEvent.setup();
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="America/Sao_Paulo"
      canCreate
      userId="user-a"
      catalog={catalog}
      batches={batches}
      containers={containers}
    />,
  );
  await user.selectOptions(await screen.findByLabelText('Produto'), product.id);
  await user.selectOptions(screen.getByLabelText('Fornecedor'), supplier.id);
  await user.type(screen.getByLabelText('Lote de origem'), '0001');
  await user.type(screen.getByLabelText('Quantidade recebida'), '1.25');
  await user.type(screen.getByLabelText('Data de validade'), '2027-01-01');
  await user.click(
    screen.getByRole('button', { name: 'Registrar recebimento' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Falha ao gravar.',
  );
  expect(screen.getByLabelText('Lote de origem')).toHaveValue('0001');
});

it('exige recarregar a lista antes de liberar uma nova tentativa em conflito', async () => {
  sessionStorage.clear();
  // Fatia 6.2: a lista do painel vem de list_containers (servidor falso).
  const containers = fakeContainers([]);
  const product = {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Arroz',
    unit: 'kg' as const,
    storage_condition: 'ambient' as const,
  };
  const supplier = {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Horta',
  };
  const catalog = {
    list: vi.fn(async (kind: string) =>
      kind === 'products' ? [product] : [supplier],
    ),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
  };
  const batches = {
    list: vi.fn().mockResolvedValue([]),
    receive: vi
      .fn()
      .mockRejectedValue(
        new Error('Esta tentativa já foi usada com outros dados.'),
      ),
  };
  const user = userEvent.setup();
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="America/Sao_Paulo"
      userId="user-a"
      canCreate
      catalog={catalog}
      batches={batches}
      containers={containers}
    />,
  );
  await user.selectOptions(await screen.findByLabelText('Produto'), product.id);
  await user.selectOptions(screen.getByLabelText('Fornecedor'), supplier.id);
  await user.type(screen.getByLabelText('Lote de origem'), '0001');
  await user.type(screen.getByLabelText('Quantidade recebida'), '1.25');
  await user.type(screen.getByLabelText('Data de validade'), '2027-01-01');
  await user.click(
    screen.getByRole('button', { name: 'Registrar recebimento' }),
  );
  const start = await screen.findByRole('button', {
    name: 'Já conferi; iniciar nova tentativa',
  });
  expect(start).toBeDisabled();
  await user.click(
    screen.getByRole('button', { name: 'Atualizar lista para conferência' }),
  );
  expect(start).toBeEnabled();
  expect(containers.list).toHaveBeenCalledTimes(2);
  sessionStorage.clear();
});

it('mantém a mesma chave de reenvio após desmontar e abrir novamente', async () => {
  sessionStorage.clear();
  // Fatia 6.2: a lista do painel vem de list_containers (servidor falso).
  const containers = fakeContainers([]);
  const product = {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Arroz',
    unit: 'kg' as const,
    storage_condition: 'ambient' as const,
  };
  const supplier = {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Horta',
  };
  const catalog = {
    list: vi.fn(async (kind: string) =>
      kind === 'products' ? [product] : [supplier],
    ),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
  };
  const receive = vi
    .fn<BatchGateway['receive']>()
    .mockRejectedValue(new Error('Resposta perdida.'));
  const batches = { list: vi.fn().mockResolvedValue([]), receive };
  const scope = { organizationId: 'org', establishmentId: 'unit' };
  const user = userEvent.setup();
  async function submit() {
    await user.selectOptions(
      await screen.findByLabelText('Produto'),
      product.id,
    );
    await user.selectOptions(screen.getByLabelText('Fornecedor'), supplier.id);
    await user.type(screen.getByLabelText('Lote de origem'), '0001');
    await user.type(screen.getByLabelText('Quantidade recebida'), '1.25');
    await user.type(screen.getByLabelText('Data de validade'), '2027-01-01');
    await user.click(
      screen.getByRole('button', { name: 'Registrar recebimento' }),
    );
    await screen.findByRole('alert');
  }
  const view = render(
    <BatchPanel
      scope={scope}
      timezone="America/Sao_Paulo"
      canCreate
      userId="user-a"
      catalog={catalog}
      batches={batches}
      containers={containers}
    />,
  );
  await submit();
  view.unmount();
  const view2 = render(
    <BatchPanel
      scope={scope}
      timezone="America/Sao_Paulo"
      canCreate
      userId="user-a"
      catalog={catalog}
      batches={batches}
      containers={containers}
    />,
  );
  await submit();
  expect(receive).toHaveBeenCalledTimes(2);
  expect(receive.mock.calls[0]![1].intentId).toBe(
    receive.mock.calls[1]![1].intentId,
  );
  view2.unmount();
  render(
    <BatchPanel
      scope={scope}
      timezone="America/Sao_Paulo"
      canCreate
      userId="user-b"
      catalog={catalog}
      batches={batches}
      containers={containers}
    />,
  );
  await submit();
  expect(receive.mock.calls[2]![1].intentId).not.toBe(
    receive.mock.calls[0]![1].intentId,
  );
  sessionStorage.clear();
});

// V5 (M5, D-063): vírgula decimal na quantidade recebida.
async function receiveWith(typed: string) {
  sessionStorage.clear();
  const product = {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Arroz',
    unit: 'kg' as const,
    storage_condition: 'ambient' as const,
  };
  const supplier = {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Horta',
  };
  const catalog = {
    list: vi.fn(async (kind: string) =>
      kind === 'products' ? [product] : [supplier],
    ),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
  };
  const receive = vi
    .fn<BatchGateway['receive']>()
    .mockResolvedValue('10000000-0000-4000-8000-000000000009');
  const user = userEvent.setup();
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="America/Sao_Paulo"
      canCreate
      userId="user-a"
      catalog={catalog}
      batches={{ list: vi.fn().mockResolvedValue([]), receive }}
      containers={fakeContainers([])}
    />,
  );
  await user.selectOptions(await screen.findByLabelText('Produto'), product.id);
  await user.selectOptions(screen.getByLabelText('Fornecedor'), supplier.id);
  await user.type(screen.getByLabelText('Lote de origem'), '0001');
  await user.type(screen.getByLabelText('Quantidade recebida'), typed);
  await user.type(screen.getByLabelText('Data de validade'), '2027-01-01');
  await user.click(
    screen.getByRole('button', { name: 'Registrar recebimento' }),
  );
  return receive;
}

it('V5: recebimento aceita 1,25 e envia 1.25', async () => {
  const receive = await receiveWith('1,25');
  await vi.waitFor(() => expect(receive).toHaveBeenCalledTimes(1));
  expect(receive.mock.calls[0]![1].quantity).toBe('1.25');
});

it.each([
  ['1.000,50', /não use separador de milhar/],
  ['1,000.50', /não use separador de milhar/],
  ['1.250', /Quantidade ambígua: "1\.250"/],
  ['1,2345', /Confira produto, fornecedor, quantidade e datas informadas\./],
  ['abc', /Confira produto, fornecedor, quantidade e datas informadas\./],
])('V5: recebimento recusa %s sem enviar', async (typed, message) => {
  const receive = await receiveWith(typed);
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(receive).not.toHaveBeenCalled();
});

it('orienta o recebimento sem produtos e fornecedores, com destinos diretos', async () => {
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(
    <BatchPanel
      area="receber"
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="America/Sao_Paulo"
      canCreate
      userId="owner"
      catalog={{
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        setStorageCondition: vi.fn(),
      }}
      batches={{ list: vi.fn().mockResolvedValue([]), receive: vi.fn() }}
      containers={fakeContainers([])}
      areaLinks={{ hrefFor: (id) => `?area=${id}`, onSelect }}
    />,
  );
  await user.click(
    await screen.findByRole('link', { name: 'Cadastrar produto' }),
  );
  expect(onSelect).toHaveBeenCalledWith('produtos');
  expect(
    screen.getByRole('link', { name: 'Cadastrar fornecedor' }),
  ).toHaveAttribute('href', '?area=fornecedores');
  expect(
    screen.queryByRole('button', { name: 'Registrar recebimento' }),
  ).not.toBeInTheDocument();
});
