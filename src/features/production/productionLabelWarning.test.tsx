// Fatia 7.8: aviso de produção sem etiqueta baixada e registro do download.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogGateway } from '../catalog/application/catalogGateway';
import type { LabelGateway } from '../labels/application/labelGateway';
import type { ProductionGateway } from './application/productionGateway';
import type { ProductionRow } from './domain/production';
import { unlabeledMinutes } from './domain/production';
import { ProductionPanel } from './components/ProductionPanel';
import type { SettingsGateway } from '../settings/application/settingsGateway';
import type { EstablishmentSettings } from '../settings/domain/settings';
import { DEFAULT_SETTINGS } from '../settings/domain/settings';

// O PDF em si é testado em labels; aqui só importa quando o download termina bem ou mal.
const downloadLabels = vi.hoisted(() => vi.fn());
vi.mock('../labels/application/download', () => ({ downloadLabels }));

const id = (n: number) =>
  `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
const scope = { organizationId: id(1), establishmentId: id(2) };
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
  handled_by_name: 'Bruno Lima',
  note: null,
  timezone,
  container_id: id(21),
  short_code: 'C-000123',
  voided: null,
  label_downloaded_at: null,
  ...patch,
});

function render8(
  rows: ProductionRow[],
  {
    canCreate = true,
    settings = {},
    withRecord = true,
  }: {
    canCreate?: boolean;
    settings?: Partial<EstablishmentSettings>;
    withRecord?: boolean;
  } = {},
) {
  const gateway: ProductionGateway & {
    recordLabelDownload: ReturnType<typeof vi.fn>;
  } = {
    list: vi.fn().mockResolvedValue(rows),
    register: vi.fn(),
    void: vi.fn(),
    recordLabelDownload: vi.fn().mockResolvedValue(undefined),
  };
  if (!withRecord)
    delete (gateway as Partial<typeof gateway>).recordLabelDownload;
  const labels: LabelGateway = { ensure: vi.fn(), get: vi.fn() };
  const catalog: CatalogGateway = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
  };
  const loaded: SettingsGateway = {
    get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings }),
    save: vi.fn(),
  };
  render(
    <ProductionPanel
      scope={scope}
      timezone={timezone}
      userId={cook}
      canCreate={canCreate}
      catalog={catalog}
      gateway={gateway}
      loadMembers={vi.fn().mockResolvedValue([])}
      setDisplayName={vi.fn()}
      now={() => NOW}
      settings={loaded}
      labels={labels}
    />,
  );
  return { gateway };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  downloadLabels.mockReset().mockResolvedValue(undefined);
});

describe('unlabeledMinutes (7.8)', () => {
  const at = (minutes: number) =>
    new Date(Date.parse('2026-11-14T14:00:00.000Z') + minutes * 60000);
  const base = row({ produced_at: '2026-11-14T14:00:00.000Z' });
  it('avisa só acima do limite, sem etiqueta baixada', () => {
    expect(unlabeledMinutes(base, 60, at(60))).toBeNull();
    expect(unlabeledMinutes(base, 60, at(61))).toBe(61);
    expect(unlabeledMinutes(base, 60, at(150))).toBe(150);
  });
  it('não avisa se a etiqueta já foi baixada, a produção foi anulada ou não há recipiente', () => {
    const late = at(300);
    expect(
      unlabeledMinutes(
        { ...base, label_downloaded_at: '2026-11-14T14:20:00.000Z' },
        60,
        late,
      ),
    ).toBeNull();
    expect(
      unlabeledMinutes(
        { ...base, voided: { reason: 'erro', created_at: base.produced_at } },
        60,
        late,
      ),
    ).toBeNull();
    expect(
      unlabeledMinutes({ ...base, container_id: null }, 60, late),
    ).toBeNull();
  });
});

describe('aviso de produção sem etiqueta (7.8)', () => {
  it('mostra o resumo e o aviso na produção acima do limite da unidade', async () => {
    render8([
      row({ produced_at: '2026-11-14T12:30:00.000Z' }),
      row({ batch_id: id(22), container_id: id(23), short_code: 'C-000124' }),
    ]);
    const list = within(
      await screen.findByRole('list', { name: 'Produções recentes' }),
    );
    expect(
      list.getByText(/sem etiqueta há 2 horas e 30 minutos/),
    ).toBeVisible();
    expect(list.getByText(/acima de 1 hora\)/)).toBeVisible();
    expect(list.getAllByText(/sem etiqueta há/)).toHaveLength(1);
    expect(
      screen.getByText(
        /1 produção está sem etiqueta baixada há mais de 1 hora\. É só um aviso/,
      ),
    ).toBeVisible();
  });
  it('usa o limite configurado e não avisa quando a etiqueta já foi baixada', async () => {
    render8(
      [
        row({ produced_at: '2026-11-14T13:00:00.000Z' }),
        row({
          batch_id: id(22),
          container_id: id(23),
          produced_at: '2026-11-14T10:00:00.000Z',
          label_downloaded_at: '2026-11-14T10:10:00.000Z',
        }),
      ],
      { settings: { unlabeled_limit_minutes: 150 } },
    );
    await screen.findByRole('list', { name: 'Produções recentes' });
    expect(screen.queryByText(/sem etiqueta há/)).toBeNull();
    expect(screen.queryByText(/está sem etiqueta baixada/)).toBeNull();
  });
  it('não avisa de produção anulada', async () => {
    render8([
      row({
        produced_at: '2026-11-14T10:00:00.000Z',
        voided: { reason: 'erro', created_at: '2026-11-14T10:05:00.000Z' },
      }),
    ]);
    await screen.findByRole('list', { name: 'Produções recentes' });
    expect(screen.queryByText(/sem etiqueta há/)).toBeNull();
  });
  it('registra o download depois que o PDF é gerado e relê a lista', async () => {
    const { gateway } = render8([row()]);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Baixar etiqueta (C-000123)' }),
    );
    await waitFor(() =>
      expect(gateway.recordLabelDownload).toHaveBeenCalledWith(scope, id(21)),
    );
    await waitFor(() => expect(gateway.list).toHaveBeenCalledTimes(2));
  });
  it('não registra quando o PDF não é gerado', async () => {
    downloadLabels.mockRejectedValue(new Error('Etiqueta bloqueada.'));
    const { gateway } = render8([row()]);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Baixar etiqueta (C-000123)' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Etiqueta bloqueada.',
    );
    expect(gateway.recordLabelDownload).not.toHaveBeenCalled();
  });
  it('se o registro falhar, o PDF continua baixado e a pessoa é avisada', async () => {
    const { gateway } = render8([row()]);
    gateway.recordLabelDownload.mockRejectedValue(new Error('x'));
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Baixar etiqueta (C-000123)' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'A etiqueta foi baixada, mas não foi possível registrar o horário.',
    );
  });
  it('gateway antigo, sem o método de registro, segue funcionando', async () => {
    render8([row()], { withRecord: false });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Baixar etiqueta (C-000123)' }),
    );
    await waitFor(() => expect(downloadLabels).toHaveBeenCalledTimes(1));
  });
});
