import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BatchPanel } from './BatchPanel';
import type { BatchGateway } from '../application/batchGateway';

it('mantém os dados quando o recebimento falha', async () => {
  sessionStorage.clear();
  const product = {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Arroz',
    unit: 'kg' as const,
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
  const product = {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Arroz',
    unit: 'kg' as const,
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
  expect(batches.list).toHaveBeenCalledTimes(2);
  sessionStorage.clear();
});

it('mantém a mesma chave de reenvio após desmontar e abrir novamente', async () => {
  sessionStorage.clear();
  const product = {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Arroz',
    unit: 'kg' as const,
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
    />,
  );
  await submit();
  expect(receive.mock.calls[2]![1].intentId).not.toBe(
    receive.mock.calls[0]![1].intentId,
  );
  sessionStorage.clear();
});
