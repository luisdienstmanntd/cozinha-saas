import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BatchPanel } from '../../batches/components/BatchPanel';
import { containerRow, fakeContainers } from '../../../test/fakeContainers';
import type { OccurrenceGateway } from '../application/occurrenceGateway';
import { DecisionRejected } from '../application/occurrenceGateway';
import type { OccurrenceRow } from '../domain/occurrence';
import { MovementBlocked } from '../../movements/application/movementGateway';
import type { MovementGateway } from '../../movements/application/movementGateway';
import type { CatalogItem } from '../../catalog/domain/catalog';

// Fatia 6.5b (desenho 7.3 e 7.6): recebimento com conservação e temperatura, bloqueados no topo do
// painel, decisão só pelo proprietário, consumo de bloqueado recusado com a mensagem do banco.
const scope = { organizationId: 'org', establishmentId: 'unit' };
const containerId = '12345678-1234-4234-8234-123456789abc';
const occurrenceId = '22345678-1234-4234-8234-123456789abc';
const product = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Frango',
  unit: 'kg' as const,
  storage_condition: 'refrigerated' as const,
};
const supplier = { id: '10000000-0000-4000-8000-000000000002', name: 'Horta' };
const catalog = (products: CatalogItem[] = [product]) => ({
  list: vi.fn(async (kind: string) =>
    kind === 'products' ? products : [supplier],
  ),
  create: vi.fn(),
  setStorageCondition: vi.fn(),
});
const occurrence = (over: Partial<OccurrenceRow> = {}): OccurrenceRow => ({
  occurrence_id: occurrenceId,
  kind: 'temperature_not_measured',
  batch_id: '32345678-1234-4234-8234-123456789abc',
  handling_id: null,
  product_name: 'Frango',
  source_code: 'L-77',
  unit: 'kg',
  reason: 'Termômetro sem pilha',
  created_at: '2026-11-13T12:00:00.000Z',
  timezone: 'America/Sao_Paulo',
  status: 'pending',
  decision_reason: null,
  decided_at: null,
  containers: [
    {
      container_id: containerId,
      short_code: 'C-000042',
      kind: 'integral',
      balance: 10,
    },
  ],
  ...over,
});
function occurrencesGateway(rows: OccurrenceRow[]) {
  return {
    list: vi.fn<OccurrenceGateway['list']>().mockResolvedValue(rows),
    decide: vi
      .fn<OccurrenceGateway['decide']>()
      .mockResolvedValue('42345678-1234-4234-8234-123456789abc'),
  };
}
function renderPanel({
  canCreate = true,
  rows = [occurrence()],
  occurrences = occurrencesGateway(rows),
  products,
  movements,
}: {
  canCreate?: boolean;
  rows?: OccurrenceRow[];
  occurrences?: ReturnType<typeof occurrencesGateway>;
  products?: CatalogItem[];
  movements?: MovementGateway;
} = {}) {
  const batches = {
    list: vi.fn().mockResolvedValue([]),
    receive: vi.fn().mockResolvedValue('52345678-1234-4234-8234-123456789abc'),
  };
  render(
    <BatchPanel
      scope={scope}
      timezone="America/Sao_Paulo"
      canCreate={canCreate}
      userId="user-a"
      catalog={catalog(products)}
      batches={batches}
      containers={fakeContainers([
        containerRow({ container_id: containerId, product_name: 'Frango' }),
      ])}
      occurrences={occurrences}
      movements={movements}
    />,
  );
  return { batches, occurrences };
}

it('mostra o bloqueio no topo e na linha do recipiente, com motivo e tempo', async () => {
  renderPanel();
  const blocks = await screen.findByRole('region', {
    name: 'Bloqueios e ocorrências',
  });
  expect(blocks).toHaveTextContent('BLOQUEADO - aguardando decisão');
  expect(blocks).toHaveTextContent('Recebimento sem medição de temperatura');
  expect(blocks).toHaveTextContent('Motivo registrado: Termômetro sem pilha');
  expect(blocks).toHaveTextContent('13/11/2026, 09:00');
  expect(blocks).toHaveTextContent(/\(há \d+ (min|h|dias)\)/);
  expect(blocks).toHaveTextContent('C-000042 (saldo 10 kg)');
  const list = screen.getByRole('list', { name: 'Recipientes e validade' });
  expect(list).toHaveTextContent('BLOQUEADO - aguardando decisão');
});

it('proprietário registra a decisão com justificativa e o painel é relido', async () => {
  const { occurrences } = renderPanel();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Registrar decisão' }),
  );
  const form = screen.getByRole('form', {
    name: 'Decisão da ocorrência de Frango',
  });
  expect(form).toHaveTextContent(
    'Decida seguindo o procedimento sanitário da cozinha.',
  );
  await user.click(
    within(form).getByRole('button', { name: 'Confirmar decisão' }),
  );
  expect(within(form).getByRole('alert')).toHaveTextContent(
    'Escolha liberar ou rejeitar e escreva a justificativa',
  );
  expect(occurrences.decide).not.toHaveBeenCalled();
  await user.click(within(form).getByLabelText('Liberar o uso'));
  await user.type(
    within(form).getByLabelText('Justificativa da decisão'),
    '  Medido depois: 3 °C ',
  );
  occurrences.list.mockResolvedValue([]);
  await user.click(
    within(form).getByRole('button', { name: 'Confirmar decisão' }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Decisão registrada: Frango liberado.',
  );
  expect(occurrences.decide).toHaveBeenCalledWith(scope, {
    occurrenceId,
    decision: 'released',
    reason: 'Medido depois: 3 °C',
    intentId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  expect(await screen.findByText('Nenhum recipiente bloqueado.')).toBeVisible();
  expect(
    screen.getByRole('list', { name: 'Recipientes e validade' }),
  ).not.toHaveTextContent('BLOQUEADO');
});

it('repete a mesma tentativa de decisão após falha e mostra recusa do banco', async () => {
  const occurrences = occurrencesGateway([occurrence()]);
  occurrences.decide
    .mockRejectedValueOnce(new Error('rede'))
    .mockRejectedValueOnce(
      new DecisionRejected(
        'Esta ocorrência já foi decidida. Atualize a lista para ver a decisão registrada.',
      ),
    );
  renderPanel({ occurrences });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Registrar decisão' }),
  );
  const form = screen.getByRole('form', {
    name: 'Decisão da ocorrência de Frango',
  });
  await user.click(within(form).getByLabelText(/Rejeitar/));
  await user.type(
    within(form).getByLabelText('Justificativa da decisão'),
    'Embalagem morna',
  );
  await user.click(
    within(form).getByRole('button', { name: 'Confirmar decisão' }),
  );
  expect(await within(form).findByRole('alert')).toHaveTextContent(
    'Repita a mesma tentativa',
  );
  await user.click(
    within(form).getByRole('button', { name: 'Confirmar decisão' }),
  );
  expect(await within(form).findByRole('alert')).toHaveTextContent(
    'já foi decidida',
  );
  const [first, second] = occurrences.decide.mock.calls;
  expect(first![1].intentId).toBe(second![1].intentId);
});

it('membro vê o bloqueio, mas não a ação de decisão (E2E 33)', async () => {
  renderPanel({ canCreate: false });
  const blocks = await screen.findByRole('region', {
    name: 'Bloqueios e ocorrências',
  });
  expect(blocks).toHaveTextContent('BLOQUEADO - aguardando decisão');
  expect(blocks).toHaveTextContent(
    'Somente o proprietário registra a decisão.',
  );
  expect(
    screen.queryByRole('button', { name: 'Registrar decisão' }),
  ).not.toBeInTheDocument();
});

it('rejeitada aparece como aguardando descarte, com a justificativa', async () => {
  renderPanel({
    rows: [
      occurrence({
        status: 'rejected',
        decision_reason: 'Embalagem morna',
        decided_at: '2026-11-13T13:30:00.000Z',
      }),
    ],
  });
  const blocks = await screen.findByRole('region', {
    name: 'Bloqueios e ocorrências',
  });
  expect(blocks).toHaveTextContent('REJEITADO - somente descarte');
  expect(blocks).toHaveTextContent(
    'Rejeitado em 13/11/2026, 10:30. Justificativa: Embalagem morna',
  );
  expect(blocks).toHaveTextContent('Registre o descarte do saldo');
  expect(
    screen.queryByRole('button', { name: 'Registrar decisão' }),
  ).not.toBeInTheDocument();
});

it('mostra ocorrências decididas sob pedido, sem chamar de aprovado', async () => {
  const occurrences = occurrencesGateway([]);
  occurrences.list.mockImplementation(async (_scope, filter) =>
    filter === 'all'
      ? [
          occurrence({
            status: 'released',
            decision_reason: 'Medido depois',
            decided_at: '2026-11-13T13:30:00.000Z',
          }),
        ]
      : [],
  );
  renderPanel({ occurrences });
  const user = userEvent.setup();
  await user.click(
    await screen.findByLabelText(
      'Mostrar todas as ocorrências, inclusive decididas',
    ),
  );
  const blocks = screen.getByRole('region', {
    name: 'Bloqueios e ocorrências',
  });
  expect(
    await within(blocks).findByText('Liberado pelo proprietário'),
  ).toBeVisible();
  expect(blocks).toHaveTextContent('Liberado em 13/11/2026, 10:30');
  expect(blocks).not.toHaveTextContent(/aprovad|conform/i);
  expect(occurrences.list).toHaveBeenCalledWith(scope, 'all');
});

it('falha na leitura de ocorrências não deixa painel parcial', async () => {
  const occurrences = occurrencesGateway([]);
  occurrences.list.mockRejectedValue(new Error('sem acesso'));
  renderPanel({ occurrences });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Não foi possível carregar todos',
  );
  expect(
    screen.queryByRole('list', { name: 'Recipientes e validade' }),
  ).not.toBeInTheDocument();
});

async function fillReceipt(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText('Produto'), product.id);
  await user.selectOptions(screen.getByLabelText('Fornecedor'), supplier.id);
  await user.type(screen.getByLabelText('Lote de origem'), 'L-1');
  await user.type(screen.getByLabelText('Quantidade recebida'), '10');
  await user.type(screen.getByLabelText('Data de validade'), '2027-01-01');
}

it('recebimento refrigerado com temperatura medida envia a conservação do produto', async () => {
  const { batches } = renderPanel({ rows: [] });
  const user = userEvent.setup();
  await fillReceipt(user);
  expect(
    screen.getByText('Conservação: Refrigerado (definida no produto)'),
  ).toBeVisible();
  await user.click(screen.getByLabelText('Temperatura medida'));
  await user.type(screen.getByLabelText('Temperatura medida, em °C'), '3.5');
  await user.click(
    screen.getByRole('button', { name: 'Registrar recebimento' }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Recebimento registrado.',
  );
  expect(batches.receive.mock.calls[0]![1]).toMatchObject({
    storageCondition: 'refrigerated',
    temperatureStatus: 'measured',
    receivedTemperatureC: '3.5',
    temperatureReason: null,
  });
});

it('sem medição exige justificativa e avisa que o recebimento ficará bloqueado', async () => {
  const { batches } = renderPanel({ rows: [] });
  const user = userEvent.setup();
  await fillReceipt(user);
  await user.click(screen.getByLabelText('Não foi possível medir'));
  expect(screen.getByRole('note')).toHaveTextContent(
    'O recebimento ficará bloqueado para uso até a decisão do responsável.',
  );
  const reason = screen.getByLabelText(
    'Justificativa (por que não foi possível medir)',
  );
  reason.removeAttribute('required');
  await user.click(
    screen.getByRole('button', { name: 'Registrar recebimento' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Confira a temperatura',
  );
  expect(batches.receive).not.toHaveBeenCalled();
  await user.type(reason, 'Termômetro sem pilha');
  await user.click(
    screen.getByRole('button', { name: 'Registrar recebimento' }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent(
    'O recebimento ficou bloqueado para uso até a decisão do proprietário.',
  );
  expect(batches.receive.mock.calls[0]![1]).toMatchObject({
    storageCondition: 'refrigerated',
    temperatureStatus: 'not_measured',
    receivedTemperatureC: null,
    temperatureReason: 'Termômetro sem pilha',
  });
});

it('recusa temperatura fora da faixa ou com mais de uma casa decimal', async () => {
  const { batches } = renderPanel({ rows: [] });
  const user = userEvent.setup();
  await fillReceipt(user);
  await user.click(screen.getByLabelText('Temperatura medida'));
  for (const value of ['81', '4.25', 'quatro']) {
    const input = screen.getByLabelText('Temperatura medida, em °C');
    await user.clear(input);
    await user.type(input, value);
    await user.click(
      screen.getByRole('button', { name: 'Registrar recebimento' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confira a temperatura',
    );
  }
  expect(batches.receive).not.toHaveBeenCalled();
});

it('produto em ambiente aceita temperatura opcional', async () => {
  const ambient = {
    ...product,
    name: 'Arroz',
    storage_condition: 'ambient' as const,
  };
  const { batches } = renderPanel({ rows: [], products: [ambient] });
  const user = userEvent.setup();
  await fillReceipt(user);
  expect(
    screen.queryByLabelText('Não foi possível medir'),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Registrar recebimento' }),
  );
  await screen.findByRole('status');
  expect(batches.receive.mock.calls[0]![1]).toMatchObject({
    storageCondition: 'ambient',
    temperatureStatus: 'not_required',
    receivedTemperatureC: null,
  });
});

it('produto sem conservação definida não pode ser recebido', async () => {
  const undefinedProduct = { ...product, storage_condition: null };
  const { batches } = renderPanel({ rows: [], products: [undefinedProduct] });
  const user = userEvent.setup();
  await user.selectOptions(await screen.findByLabelText('Produto'), product.id);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Defina a conservação deste produto no catálogo antes de receber.',
  );
  expect(
    screen.getByRole('button', { name: 'Registrar recebimento' }),
  ).toBeDisabled();
  expect(batches.receive).not.toHaveBeenCalled();
});

it('consumo de recipiente bloqueado é recusado na tela com a mensagem do banco (E2E 29)', async () => {
  const movements = {
    list: vi.fn().mockResolvedValue([]),
    record: vi
      .fn()
      .mockRejectedValue(
        new MovementBlocked(
          'Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.',
        ),
      ),
  };
  renderPanel({ movements });
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: 'Ver movimentações' }),
  );
  const panel = await screen.findByRole('region', { name: 'Movimentações' });
  expect(panel).toHaveTextContent(
    'BLOQUEADO - aguardando decisão: consumo e manipulação ficam recusados até a decisão do proprietário. O descarte continua permitido.',
  );
  await within(panel).findByLabelText('Quantidade da saída');
  await user.type(within(panel).getByLabelText('Quantidade da saída'), '1');
  await user.click(
    within(panel).getByRole('button', { name: 'Registrar saída' }),
  );
  await user.click(
    await within(panel).findByRole('button', { name: 'Confirmar saída' }),
  );
  expect(await within(panel).findByRole('alert')).toHaveTextContent(
    'Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.',
  );
});
