import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { MovementPanel } from './MovementPanel';
import {
  MovementBlocked,
  MovementRejected,
} from '../application/movementGateway';

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

it('avisa o painel depois de uma saída confirmada, e só depois dela (fatia 6.2)', async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  const onRecorded = vi.fn();
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
      gateway={{ list: vi.fn().mockResolvedValue([]), record }}
      onRecorded={onRecorded}
    />,
  );
  await user.type(await screen.findByLabelText('Quantidade da saída'), '0.5');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar saída' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível confirmar',
  );
  expect(onRecorded).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Repetir tentativa' }));
  await vi.waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
  sessionStorage.clear();
});

it('conta a transferência da manipulação como saída e não oferece anulá-la (fatia 6.3)', async () => {
  sessionStorage.clear();
  const base = {
    reason: null,
    created_by: 'autor',
    created_at: '2026-01-01T12:00:00Z',
    timezone: 'UTC',
    reverses_id: null,
  };
  const list = vi.fn().mockResolvedValue([
    { ...base, id: 'consumo', kind: 'consumption', quantity: 1 },
    {
      ...base,
      id: 'transferencia',
      kind: 'transfer',
      quantity: 4,
      handlingId: '32345678-1234-4234-8234-123456789abc',
    },
    {
      ...base,
      id: 'sobra',
      kind: 'discard',
      quantity: 0.5,
      reason: 'Sobra',
      handlingId: '32345678-1234-4234-8234-123456789abc',
    },
  ]);
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Queijo',
        sourceCode: 'Q1',
        quantity: 10,
        unit: 'kg',
      }}
      canCreate
      gateway={{ list, record: vi.fn() }}
    />,
  );
  expect(await screen.findByText('Saldo registrado: 4.5 kg')).toBeVisible();
  expect(
    screen.getByText(/Transferência para recipientes derivados — 4 kg/),
  ).toBeVisible();
  expect(
    screen.getByText(/Descarte de sobra da manipulação — 0.5 kg/),
  ).toBeVisible();
  // Só o consumo comum pode ser anulado aqui; a manipulação é desfeita pela anulação dela (6.4).
  expect(
    screen.getAllByRole('button', { name: 'Anular registro' }),
  ).toHaveLength(1);
});

it('conta a devolução da manipulação anulada como entrada e não oferece anular os eventos dela (fatia 6.4)', async () => {
  sessionStorage.clear();
  const handlingId = '32345678-1234-4234-8234-123456789abc';
  const base = {
    reason: null,
    created_by: 'autor',
    created_at: '2026-01-01T12:00:00Z',
    timezone: 'UTC',
    reverses_id: null,
  };
  const list = vi.fn().mockResolvedValue([
    { ...base, id: 'consumo', kind: 'consumption', quantity: 1 },
    { ...base, id: 'transferencia', kind: 'transfer', quantity: 4, handlingId },
    {
      ...base,
      id: 'sobra',
      kind: 'discard',
      quantity: 0.5,
      reason: 'Sobra',
      handlingId,
    },
    {
      ...base,
      id: 'devolucao',
      kind: 'transfer_reversal',
      quantity: 4,
      reason: 'Validade digitada errada',
      reverses_id: 'transferencia',
      handlingId,
    },
    {
      ...base,
      id: 'sobra-anulada',
      kind: 'reversal',
      quantity: 0.5,
      reason: 'Validade digitada errada',
      reverses_id: 'sobra',
      handlingId,
    },
  ]);
  render(
    <MovementPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      userId="user"
      batch={{
        id: 'batch',
        productName: 'Queijo',
        sourceCode: 'Q1',
        quantity: 10,
        unit: 'kg',
      }}
      canCreate
      gateway={{ list, record: vi.fn() }}
    />,
  );
  expect(await screen.findByText('Saldo registrado: 9 kg')).toBeVisible();
  expect(
    screen.getByText(
      /Devolução da transferência \(manipulação anulada\) — 4 kg/,
    ),
  ).toBeVisible();
  expect(
    screen.getByText(
      /Anulação do descarte de sobra \(manipulação anulada\) — 0.5 kg/,
    ),
  ).toBeVisible();
  expect(
    screen.getByText(
      /Transferência para recipientes derivados — 4 kg.*anulado/,
    ),
  ).toBeVisible();
  // Só o consumo comum continua anulável aqui.
  expect(
    screen.getAllByRole('button', { name: 'Anular registro' }),
  ).toHaveLength(1);
});

it('recipiente vencido: mostra a faixa e só oferece descarte (fatia 6.11)', async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([]);
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
      expired
    />,
  );
  expect(await screen.findByText('VENCIDO - somente descarte')).toBeVisible();
  expect(
    screen.getByText(/O consumo é recusado; o descarte continua permitido/),
  ).toBeVisible();
  const kind = screen.getByLabelText('Tipo de saída');
  expect(
    within(kind).queryByRole('option', { name: 'Consumo' }),
  ).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Quantidade da saída'), '0.5');
  await user.type(
    screen.getByLabelText('Motivo (obrigatório para descarte)'),
    'Validade passou',
  );
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar saída' }));
  expect(record.mock.calls.at(0)?.[1]).toMatchObject({
    kind: 'discard',
    quantity: '0.5',
  });
});

it('recusa de consumo por vencimento mostra a mensagem do banco (fatia 6.11)', async () => {
  sessionStorage.clear();
  const user = userEvent.setup();
  const list = vi.fn().mockResolvedValue([]);
  const message =
    'Recipiente vencido: a validade registrada (01/01/2026) já passou na data da unidade. Consumo recusado; o descarte continua permitido.';
  const record = vi.fn().mockRejectedValue(new MovementBlocked(message));
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
  await screen.findByText(/Saldo registrado: 1 kg/);
  await user.type(screen.getByLabelText('Quantidade da saída'), '0.5');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar saída' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
});
