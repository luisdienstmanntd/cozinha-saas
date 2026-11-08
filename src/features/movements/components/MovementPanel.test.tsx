import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { MovementPanel } from './MovementPanel';
import { MovementRejected } from '../application/movementGateway';

it('apresenta o saldo registrado e reenvia a mesma tentativa após falha', async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([]);
  const record = vi
    .fn()
    .mockRejectedValueOnce(new Error('falha'))
    .mockResolvedValueOnce('evento');
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Arroz',
        sourceCode: 'L1',
        quantity: 1,
        unit: 'kg',
      }}
      canCreate
      gateway={{ list, record }}
    />,
  );
  expect(await screen.findByText(/Saldo registrado: 1 kg/)).toBeVisible();
  await user.type(screen.getByLabelText('Quantidade da saída'), '0.5');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar saída' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível confirmar',
  );
  await user.click(screen.getByRole('button', { name: 'Repetir tentativa' }));
  expect(record).toHaveBeenCalledTimes(2);
  expect(record.mock.calls.at(0)?.[1]).toEqual(record.mock.calls.at(1)?.[1]);
});

it('exige motivo para descarte e mostra o histórico sem alterar a entrada', async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([
    {
      id: 'event',
      kind: 'consumption',
      quantity: 0.25,
      reason: null,
      created_by: 'autor',
      created_at: '2026-01-01T12:00:00Z',
      timezone: 'UTC',
    },
  ]);
  const record = vi.fn();
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Arroz',
        sourceCode: 'L1',
        quantity: 1,
        unit: 'kg',
      }}
      canCreate
      gateway={{ list, record }}
    />,
  );
  expect(await screen.findByText('Saldo registrado: 0.75 kg')).toBeVisible();
  expect(screen.getByText(/Consumo — 0.25 kg/)).toBeVisible();
  await user.selectOptions(screen.getByLabelText('Tipo de saída'), 'discard');
  await user.type(screen.getByLabelText('Quantidade da saída'), '0.5');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Confira tipo, quantidade e motivo',
  );
  expect(record).not.toHaveBeenCalled();
});

it('não mostra saldo ou formulário quando o histórico não pode ser consultado', async () => {
  sessionStorage.clear();
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Arroz',
        sourceCode: 'L1',
        quantity: 1,
        unit: 'kg',
      }}
      canCreate
      gateway={{
        list: vi.fn().mockRejectedValue(new Error('sem acesso')),
        record: vi.fn(),
      }}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível consultar o histórico',
  );
  expect(screen.queryByText(/Saldo registrado:/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Registrar saída' }),
  ).not.toBeInTheDocument();
});

it('informa enquanto o histórico ainda está sendo consultado', () => {
  sessionStorage.clear();
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Arroz',
        sourceCode: 'L1',
        quantity: 1,
        unit: 'kg',
      }}
      canCreate
      gateway={{
        list: vi.fn().mockReturnValue(new Promise(() => {})),
        record: vi.fn(),
      }}
    />,
  );
  expect(screen.getByText('Consultando histórico…')).toBeVisible();
});

it('permite corrigir antes do envio e após uma recusa definitiva', async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  const record = vi.fn().mockRejectedValue(new MovementRejected());
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Arroz',
        sourceCode: 'L1',
        quantity: 1,
        unit: 'kg',
      }}
      canCreate
      gateway={{ list: vi.fn().mockResolvedValue([]), record }}
    />,
  );
  await user.type(await screen.findByLabelText('Quantidade da saída'), '2');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  await user.click(
    screen.getByRole('button', { name: 'Corrigir antes de enviar' }),
  );
  expect(record).not.toHaveBeenCalled();
  await user.type(await screen.findByLabelText('Quantidade da saída'), '2');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar saída' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Saída recusada');
  await user.click(screen.getByRole('button', { name: 'Atualizar histórico' }));
  await user.click(
    await screen.findByRole('button', { name: 'Iniciar outra tentativa' }),
  );
  expect(await screen.findByLabelText('Quantidade da saída')).toBeVisible();
});

it('informa que a saída foi confirmada quando falha a limpeza local', async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  const remove = vi
    .spyOn(Storage.prototype, 'removeItem')
    .mockImplementation(() => {
      throw new Error('armazenamento');
    });
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Arroz',
        sourceCode: 'L1',
        quantity: 1,
        unit: 'kg',
      }}
      canCreate
      gateway={{
        list: vi.fn().mockResolvedValue([]),
        record: vi.fn().mockResolvedValue('evento'),
      }}
    />,
  );
  await user.type(await screen.findByLabelText('Quantidade da saída'), '0.5');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar saída' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Saída confirmada',
  );
  expect(
    screen.queryByRole('button', { name: 'Repetir tentativa' }),
  ).not.toBeInTheDocument();
  remove.mockRestore();
  sessionStorage.clear();
});

it('não apaga uma intenção nova quando a resposta de uma tela antiga chega tarde', async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  let resolve!: (value: string) => void;
  const slow = new Promise<string>((done) => {
    resolve = done;
  });
  const gateway = {
    list: vi.fn().mockResolvedValue([]),
    record: vi.fn().mockReturnValueOnce(slow).mockResolvedValue('evento'),
  };
  const props = {
    scope: { organizationId: 'org', establishmentId: 'unit' },
    userId: 'user',
    batch: {
      id: 'batch',
      productName: 'Arroz',
      sourceCode: 'L1',
      quantity: 1,
      unit: 'kg',
    },
    canCreate: true,
    gateway,
  };
  const old = render(<MovementPanel {...props} />);
  await user.type(await screen.findByLabelText('Quantidade da saída'), '0.5');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar saída' }));
  old.unmount();
  render(<MovementPanel {...props} />);
  await user.click(
    await screen.findByRole('button', { name: 'Repetir tentativa' }),
  );
  await user.type(await screen.findByLabelText('Quantidade da saída'), '0.25');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  const key = 'movement-intent:user:org:unit:batch';
  const newer = sessionStorage.getItem(key);
  await act(async () => {
    resolve('evento');
    await slow;
  });
  expect(sessionStorage.getItem(key)).toBe(newer);
});

it('não envia duas requisições ao confirmar repetidamente enquanto aguarda', async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  const record = vi.fn().mockReturnValue(new Promise(() => {}));
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Arroz',
        sourceCode: 'L1',
        quantity: 1,
        unit: 'kg',
      }}
      canCreate
      gateway={{ list: vi.fn().mockResolvedValue([]), record }}
    />,
  );
  await user.type(await screen.findByLabelText('Quantidade da saída'), '0.5');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  await user.dblClick(screen.getByRole('button', { name: 'Confirmar saída' }));
  expect(record).toHaveBeenCalledTimes(1);
});

it('confirma anulação integral com motivo e preserva o histórico', async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  const id = '12345678-1234-4234-8234-123456789abc';
  const original = {
    id,
    kind: 'discard' as const,
    quantity: 0.5,
    reason: 'dano',
    created_by: 'autor',
    created_at: '2026-01-01T12:00:00Z',
    timezone: 'UTC',
    reverses_id: null,
  };
  const list = vi
    .fn()
    .mockResolvedValueOnce([original])
    .mockResolvedValue([
      original,
      {
        ...original,
        id: '22345678-1234-4234-8234-123456789abc',
        kind: 'reversal',
        reverses_id: id,
        reason: 'erro',
      },
    ]);
  const record = vi.fn().mockResolvedValue('evento');
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Arroz',
        sourceCode: 'L1',
        quantity: 1,
        unit: 'kg',
      }}
      canCreate
      gateway={{ list, record }}
    />,
  );
  expect(await screen.findByText('Saldo registrado: 0.5 kg')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Anular registro' }));
  await user.type(screen.getByLabelText('Motivo da anulação'), 'erro');
  await user.click(screen.getByRole('button', { name: 'Revisar anulação' }));
  expect(screen.getByText(/não recupera alimento/i)).toBeVisible();
  expect(screen.getByText(/Registro original: Descarte/)).toHaveTextContent(
    '12345678',
  );
  await user.click(screen.getByRole('button', { name: 'Confirmar anulação' }));
  expect(await screen.findByText('Saldo registrado: 1 kg')).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Para substituir, registre uma nova saída',
  );
  expect(
    screen.queryByRole('button', { name: 'Anular registro' }),
  ).not.toBeInTheDocument();
  expect(record.mock.calls.at(0)?.[1]).toMatchObject({
    kind: 'reversal',
    targetId: id,
    reason: 'erro',
  });
});

it('identifica como inválida uma intenção de anulação sem alvo', async () => {
  sessionStorage.clear();
  sessionStorage.setItem(
    'movement-intent:user:org:unit:batch',
    JSON.stringify({
      batchId: 'batch',
      kind: 'reversal',
      quantity: '0.5',
      reason: 'erro',
      intentId: '12345678-1234-4234-8234-123456789abc',
    }),
  );
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Arroz',
        sourceCode: 'L1',
        quantity: 1,
        unit: 'kg',
      }}
      canCreate
      gateway={{ list: vi.fn().mockResolvedValue([]), record: vi.fn() }}
    />,
  );
  expect(
    await screen.findByText(/Não foi possível recuperar a tentativa anterior/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Repetir tentativa' }),
  ).not.toBeInTheDocument();
  sessionStorage.clear();
});

it('impede confirmar anulação se o movimento original não aparece no histórico', async () => {
  sessionStorage.clear();
  sessionStorage.setItem(
    'movement-intent:user:org:unit:batch',
    JSON.stringify({
      batchId: 'batch',
      kind: 'reversal',
      quantity: '0.5',
      reason: 'erro',
      intentId: '12345678-1234-4234-8234-123456789abc',
      targetId: '22345678-1234-4234-8234-123456789abc',
    }),
  );
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Arroz',
        sourceCode: 'L1',
        quantity: 1,
        unit: 'kg',
      }}
      canCreate
      gateway={{ list: vi.fn().mockResolvedValue([]), record: vi.fn() }}
    />,
  );
  expect(
    await screen.findByText(/não foi possível localizar o registro original/i),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Repetir tentativa' }),
  ).toBeDisabled();
  sessionStorage.clear();
});

it('não permite anulação se a tentativa armazenada estiver inválida', async () => {
  sessionStorage.clear();
  sessionStorage.setItem('movement-intent:user:org:unit:batch', 'inválido');
  const event = {
    id: '12345678-1234-4234-8234-123456789abc',
    kind: 'discard' as const,
    quantity: 0.5,
    reason: 'dano',
    created_by: 'autor',
    created_at: '2026-01-01T12:00:00Z',
    timezone: 'UTC',
  };
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Arroz',
        sourceCode: 'L1',
        quantity: 1,
        unit: 'kg',
      }}
      canCreate
      gateway={{ list: vi.fn().mockResolvedValue([event]), record: vi.fn() }}
    />,
  );
  expect(await screen.findByText('Saldo registrado: 0.5 kg')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Anular registro' }),
  ).not.toBeInTheDocument();
  sessionStorage.clear();
});
