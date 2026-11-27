// Fatia 7.6: a tela de produção segue a configuração da unidade (quem registra e janela).
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogGateway } from '../catalog/application/catalogGateway';
import type { Member } from '../handling/domain/family';
import type { ProductionGateway } from './application/productionGateway';
import type { ProductionRow } from './domain/production';
import { knownProductionMessage } from './domain/production';
import { OWN_NAME_TEXT, ProductionPanel } from './components/ProductionPanel';
import type { SettingsGateway } from '../settings/application/settingsGateway';
import type { EstablishmentSettings } from '../settings/domain/settings';
import { DEFAULT_SETTINGS } from '../settings/domain/settings';

const id = (n: number) =>
  `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
const scope = { organizationId: id(1), establishmentId: id(2) };
const cook = id(4);
const timezone = 'America/Sao_Paulo';
const NOW = new Date('2026-11-14T15:00:00.000Z');
const caldo = {
  id: id(10),
  name: 'Caldo de legumes',
  unit: 'l' as const,
  storage_condition: 'refrigerated' as const,
};
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
  ...patch,
});

function render7(
  settings: Partial<EstablishmentSettings>,
  {
    canCreate = false,
    people,
  }: { canCreate?: boolean; people?: Member[] } = {},
) {
  const gateway: ProductionGateway & { register: ReturnType<typeof vi.fn> } = {
    list: vi
      .fn()
      .mockResolvedValue([row({ late: true, late_window_minutes: 90 })]),
    register: vi.fn().mockResolvedValue(id(20)),
    void: vi.fn(),
  };
  const items: CatalogGateway = {
    list: vi.fn().mockResolvedValue([caldo]),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
  };
  const loaded: SettingsGateway = {
    get: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings }),
    save: vi.fn(),
  };
  // Pela RLS, quem não é proprietário só lê o próprio vínculo; o teste devolve também o de outra pessoa
  // para conferir que a tela não o oferece.
  const loadMembers = vi.fn().mockResolvedValue(
    people ?? [
      { user_id: cook, display_name: 'Bruno Lima', role: 'member' },
      { user_id: id(3), display_name: 'Ana Souza', role: 'owner' },
    ],
  );
  render(
    <ProductionPanel
      scope={scope}
      timezone={timezone}
      userId={cook}
      canCreate={canCreate}
      catalog={items}
      gateway={gateway}
      loadMembers={loadMembers}
      setDisplayName={vi.fn()}
      now={() => NOW}
      settings={loaded}
    />,
  );
  return { gateway, loadMembers };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('produção com a configuração da unidade (7.6)', () => {
  it('no modo colaboradores, o colaborador registra só a própria produção e não anula', async () => {
    const { gateway } = render7({ production_registrar: 'member' });
    const user = userEvent.setup();
    expect(
      await screen.findByText(
        'Você registra só a própria produção. Somente o proprietário anula produção.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /^Anular produção/ }),
    ).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Registrar produção' }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Registrar produção' }),
    );
    const who = form.getByLabelText('Produzida por');
    expect(within(who).queryByText('Ana Souza')).toBeNull();
    expect(form.queryByLabelText('Pessoa sem nome de exibição')).toBeNull();
    await user.selectOptions(form.getByLabelText('Preparação'), caldo.id);
    await user.type(form.getByLabelText('Quantidade produzida (l)'), '6');
    await user.type(form.getByLabelText('Validade'), '2026-11-16');
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar produção' }),
    );
    await waitFor(() => expect(gateway.register).toHaveBeenCalledTimes(1));
    expect(gateway.register.mock.calls[0]![1]).toMatchObject({
      handledBy: cook,
    });
  });
  it('colaborador sem nome de exibição é orientado a pedir ao proprietário', async () => {
    const { gateway } = render7(
      { production_registrar: 'member' },
      { people: [{ user_id: cook, display_name: null, role: 'member' }] },
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Registrar produção' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(OWN_NAME_TEXT);
    expect(screen.queryByRole('button', { name: 'Definir nome' })).toBeNull();
    expect(gateway.register).not.toHaveBeenCalled();
  });
  it('no padrão, o colaborador continua só consultando', async () => {
    const { loadMembers } = render7({});
    expect(
      await screen.findByText(
        'Somente o proprietário registra ou anula produção.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Registrar produção' }),
    ).toBeNull();
    expect(loadMembers).not.toHaveBeenCalled();
  });
  it('a janela da unidade decide o aviso de atraso; a lista mostra a janela usada', async () => {
    render7({ production_window_minutes: 90 }, { canCreate: true });
    const user = userEvent.setup();
    expect(
      await screen.findByText(
        /registrada fora da janela de 1 hora e 30 minutos/,
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Registrar produção' }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Registrar produção' }),
    );
    const when = form.getByLabelText(`Produzida em (fuso ${timezone})`);
    // 100 minutos antes do registro (12:00 em São Paulo).
    fireEvent.change(when, { target: { value: '2026-11-14T10:20' } });
    expect(
      form.getByText(
        'Registro mais de 1 hora e 30 minutos depois da produção. O lote ficará bloqueado até a decisão do proprietário.',
      ),
    ).toBeVisible();
    // 80 minutos: dentro da janela.
    fireEvent.change(when, { target: { value: '2026-11-14T10:40' } });
    expect(form.queryByLabelText('Justificativa do atraso')).toBeNull();
  });
  it('repete as mensagens de janela só no formato do banco', () => {
    for (const duration of [
      '2 horas',
      '1 hora e 30 minutos',
      '45 minutos',
      '24 horas',
      '1 hora e 1 minuto',
    ])
      expect(
        knownProductionMessage(
          `Produção registrada mais de ${duration} depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.`,
        ),
      ).not.toBeNull();
    expect(
      knownProductionMessage(
        'Justificativa de atraso só vale para produção registrada mais de 1 hora e 30 minutos depois de feita.',
      ),
    ).not.toBeNull();
    for (const message of [
      'Produção registrada mais de <b>x</b> depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
      'Produção registrada mais de 0 minutos depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
      'Justificativa de atraso só vale para produção registrada mais de 2 horas depois de feita. Extra',
    ])
      expect(knownProductionMessage(message)).toBeNull();
  });
});

describe('janela por preparação (7.7)', () => {
  it('a janela da preparação vale no lugar da janela da unidade', async () => {
    const own = { ...caldo, production_window_minutes: 240 };
    const gateway: ProductionGateway = {
      list: vi.fn().mockResolvedValue([]),
      register: vi.fn().mockResolvedValue(id(20)),
      void: vi.fn(),
    };
    const items: CatalogGateway = {
      list: vi.fn().mockResolvedValue([own]),
      create: vi.fn(),
      setStorageCondition: vi.fn(),
    };
    render(
      <ProductionPanel
        scope={scope}
        timezone={timezone}
        userId={id(3)}
        canCreate
        catalog={items}
        gateway={gateway}
        loadMembers={vi
          .fn()
          .mockResolvedValue([
            { user_id: id(3), display_name: 'Ana Souza', role: 'owner' },
          ])}
        setDisplayName={vi.fn()}
        now={() => NOW}
        settings={{
          get: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
          save: vi.fn(),
        }}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Registrar produção' }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Registrar produção' }),
    );
    await user.selectOptions(form.getByLabelText('Preparação'), own.id);
    const when = form.getByLabelText(`Produzida em (fuso ${timezone})`);
    // 3 horas antes do registro (12:00 em São Paulo): tardia na unidade (2 h), dentro da janela do caldo (4 h).
    fireEvent.change(when, { target: { value: '2026-11-14T09:00' } });
    expect(form.queryByLabelText('Justificativa do atraso')).toBeNull();
    // 5 horas antes: acima da janela do caldo, com a duração dela no aviso.
    fireEvent.change(when, { target: { value: '2026-11-14T07:00' } });
    expect(
      form.getByText(
        'Registro mais de 4 horas depois da produção. O lote ficará bloqueado até a decisão do proprietário.',
      ),
    ).toBeVisible();
    expect(form.getByLabelText('Justificativa do atraso')).toBeVisible();
  });
  it('repete a mensagem do banco com a janela da preparação', () => {
    expect(
      knownProductionMessage(
        'Produção registrada mais de 4 horas depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
      ),
    ).not.toBeNull();
  });
});
