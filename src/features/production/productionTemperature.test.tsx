// Fatia 7.9: temperatura opcional da produção, sem avaliação do sistema.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogGateway } from '../catalog/application/catalogGateway';
import { ProductionRejected } from './application/productionGateway';
import type { ProductionGateway } from './application/productionGateway';
import type { ProductionRow } from './domain/production';
import { formatTemperature, temperatureInputSchema } from './domain/production';
import { ProductionPanel } from './components/ProductionPanel';
import type { SettingsGateway } from '../settings/application/settingsGateway';
import { DEFAULT_SETTINGS } from '../settings/domain/settings';

const id = (n: number) =>
  `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
const scope = { organizationId: id(1), establishmentId: id(2) };
const owner = id(3);
const cook = id(4);
const timezone = 'America/Sao_Paulo';
const NOW = new Date('2026-11-14T15:00:00.000Z');
const row = (patch: Partial<ProductionRow> = {}): ProductionRow => ({
  batch_id: id(20),
  product_name: 'Caldo de legumes',
  quantity: 6,
  unit: 'l',
  expiry_date: '2026-11-16',
  produced_at: '2026-11-14T14:30:00.000Z',
  late: false,
  handled_by: cook,
  handled_by_name: 'Bruno Lima',
  note: null,
  timezone,
  container_id: id(21),
  short_code: 'C-000123',
  voided: null,
  label_downloaded_at: '2026-11-14T14:35:00.000Z',
  temperatures: [],
  ...patch,
});

function render9(
  rows: ProductionRow[],
  {
    canCreate = true,
    userId = owner,
    withRecord = true,
    registrar = 'owner' as 'owner' | 'member',
  } = {},
) {
  const gateway: ProductionGateway & {
    recordTemperature: ReturnType<typeof vi.fn>;
  } = {
    list: vi.fn().mockResolvedValue(rows),
    register: vi.fn(),
    void: vi.fn(),
    recordTemperature: vi.fn().mockResolvedValue(id(50)),
  };
  if (!withRecord)
    delete (gateway as Partial<typeof gateway>).recordTemperature;
  const catalog: CatalogGateway = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
  };
  const settings: SettingsGateway = {
    get: vi.fn().mockResolvedValue({
      ...DEFAULT_SETTINGS,
      production_registrar: registrar,
    }),
    save: vi.fn(),
  };
  render(
    <ProductionPanel
      scope={scope}
      timezone={timezone}
      userId={userId}
      canCreate={canCreate}
      catalog={catalog}
      gateway={gateway}
      loadMembers={vi.fn().mockResolvedValue([])}
      setDisplayName={vi.fn()}
      now={() => NOW}
      settings={settings}
    />,
  );
  return { gateway };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('esquema da temperatura (7.9)', () => {
  const ok = {
    batchId: id(20),
    moment: 'cooling_end',
    measuredAt: '2026-11-14T12:00:00-03:00',
  };
  it('aceita de -50 a 80 com uma casa decimal', () => {
    for (const temperature of ['4', '4.5', '-2.5', '0', '-50', '80', '80.0'])
      expect(
        temperatureInputSchema.safeParse({ ...ok, temperature }).success,
        temperature,
      ).toBe(true);
  });
  it('recusa fora da faixa, com mais casas ou sem número', () => {
    for (const temperature of [
      '80.1',
      '-50.1',
      '4.55',
      '',
      'abc',
      '1e2',
      '081',
    ])
      expect(
        temperatureInputSchema.safeParse({ ...ok, temperature }).success,
        temperature,
      ).toBe(false);
    expect(
      temperatureInputSchema.safeParse({
        ...ok,
        moment: 'outro',
        temperature: '4',
      }).success,
    ).toBe(false);
  });
  it('mostra com vírgula e uma casa', () => {
    expect(formatTemperature(4)).toBe('4,0 °C');
    expect(formatTemperature(-2.5)).toBe('-2,5 °C');
  });
});

describe('temperatura na tela de produção (7.9)', () => {
  it('proprietário registra, com vírgula, e a lista é relida', async () => {
    const { gateway } = render9([row()]);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Registrar temperatura C-000123',
      }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Registrar temperatura C-000123' }),
    );
    expect(
      form.getByText(/O sistema não avalia se a temperatura está adequada/),
    ).toBeVisible();
    await user.selectOptions(
      form.getByLabelText('Momento da medição'),
      'reheating',
    );
    await user.type(form.getByLabelText('Temperatura medida (°C)'), '74,5');
    await user.click(
      form.getByRole('button', { name: 'Registrar temperatura medida' }),
    );
    await waitFor(() =>
      expect(gateway.recordTemperature).toHaveBeenCalledTimes(1),
    );
    expect(gateway.recordTemperature).toHaveBeenCalledWith(scope, {
      batchId: id(20),
      moment: 'reheating',
      temperature: '74.5',
      measuredAt: '2026-11-14T15:00:00.000Z',
    });
    await waitFor(() => expect(gateway.list).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Temperatura registrada.',
    );
  });
  it('valor inválido não chega ao gateway', async () => {
    const { gateway } = render9([row()]);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Registrar temperatura C-000123',
      }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Registrar temperatura C-000123' }),
    );
    await user.type(form.getByLabelText('Temperatura medida (°C)'), '90');
    await user.click(
      form.getByRole('button', { name: 'Registrar temperatura medida' }),
    );
    expect(await form.findByRole('alert')).toHaveTextContent(
      'Informe a temperatura de -50 a 80 °C',
    );
    expect(gateway.recordTemperature).not.toHaveBeenCalled();
  });
  it('repete a recusa do banco', async () => {
    const { gateway } = render9([row()]);
    gateway.recordTemperature.mockRejectedValue(
      new ProductionRejected(
        'O horário da medição não pode ser anterior à produção.',
      ),
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: 'Registrar temperatura C-000123',
      }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Registrar temperatura C-000123' }),
    );
    await user.type(form.getByLabelText('Temperatura medida (°C)'), '4');
    await user.click(
      form.getByRole('button', { name: 'Registrar temperatura medida' }),
    );
    expect(await form.findByRole('alert')).toHaveTextContent(
      'O horário da medição não pode ser anterior à produção.',
    );
  });
  it('lista as temperaturas registradas sem classificá-las', async () => {
    render9([
      row({
        temperatures: [
          {
            moment: 'cooling_end',
            temperature_c: 4,
            measured_at: '2026-11-14T14:40:00.000Z',
            recorded_by_name: 'Ana Souza',
          },
          {
            moment: 'reheating',
            temperature_c: 74.5,
            measured_at: '2026-11-14T14:50:00.000Z',
            recorded_by_name: 'Ana Souza',
          },
        ],
      }),
    ]);
    const list = within(
      await screen.findByRole('list', { name: 'Temperaturas de C-000123' }),
    );
    expect(
      list.getByText(/Fim do resfriamento: 4,0 °C, medida em .*Ana Souza/),
    ).toBeVisible();
    expect(list.getByText(/Reaquecimento: 74,5 °C/)).toBeVisible();
    expect(list.getAllByText(/informada; o sistema não avalia/)).toHaveLength(
      2,
    );
    expect(screen.queryByText(/conforme|adequada\b(?!\?)/i)).toBeNull();
  });
  it('colaborador (modo da unidade) só vê o botão na própria produção', async () => {
    render9(
      [
        row({ handled_by: cook }),
        row({
          batch_id: id(22),
          container_id: id(23),
          short_code: 'C-000124',
          handled_by: owner,
        }),
      ],
      { canCreate: false, userId: cook, registrar: 'member' },
    );
    expect(
      await screen.findByRole('button', {
        name: 'Registrar temperatura C-000123',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Registrar temperatura C-000124' }),
    ).toBeNull();
  });
  it('colaborador no padrão da unidade não vê o botão', async () => {
    render9([row()], { canCreate: false, userId: cook });
    await screen.findByRole('list', { name: 'Produções recentes' });
    expect(
      screen.queryByRole('button', { name: /Registrar temperatura/ }),
    ).toBeNull();
  });
  it('produção anulada e gateway antigo não oferecem o botão', async () => {
    render9([
      row({
        voided: { reason: 'erro', created_at: '2026-11-14T14:40:00.000Z' },
      }),
    ]);
    await screen.findByRole('list', { name: 'Produções recentes' });
    expect(
      screen.queryByRole('button', { name: /Registrar temperatura/ }),
    ).toBeNull();
  });
  it('sem o método no gateway, a tela segue funcionando', async () => {
    render9([row()], { withRecord: false });
    await screen.findByRole('list', { name: 'Produções recentes' });
    expect(
      screen.queryByRole('button', { name: /Registrar temperatura/ }),
    ).toBeNull();
  });
});
