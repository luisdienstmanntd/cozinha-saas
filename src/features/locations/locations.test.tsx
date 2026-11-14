import { readFileSync, readdirSync } from 'node:fs';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { trackGateways } from '../pending/application/trackGateways';
import type { TrackedGateways } from '../pending/application/trackGateways';
import { pendingStore } from '../pending/domain/pending';
import { LocationRejected } from './application/locationGateway';
import type { LocationGateway } from './application/locationGateway';
import { createLocationGateway } from './data/supabaseLocations';
import { LocationsPanel } from './components/LocationsPanel';
import { MoveContainer } from './components/MoveContainer';
import {
  LOCATION_MESSAGES,
  MISMATCH_MESSAGE,
  knownLocationMessage,
} from './domain/locations';

const scope = {
  organizationId: '22345678-1234-4234-8234-123456789abc',
  establishmentId: '32345678-1234-4234-8234-123456789abc',
};
const user = '12345678-1234-4234-8234-123456789abc';
const container = '52345678-1234-4234-8234-123456789abc';
const place = (n: number, name: string, condition = 'refrigerated') => ({
  id: `62345678-1234-4234-8234-${String(n).padStart(12, '0')}`,
  name,
  condition: condition as 'ambient' | 'refrigerated' | 'frozen',
  active: true,
});
const people = [
  { user_id: user, display_name: 'Luis', role: 'owner' as const },
  {
    user_id: '72345678-1234-4234-8234-123456789abc',
    display_name: 'Bia',
    role: 'member' as const,
  },
];

function fake(over: Partial<LocationGateway> = {}): LocationGateway {
  return {
    list: vi.fn().mockResolvedValue([place(1, 'Câmara fria 01')]),
    currents: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue('82345678-1234-4234-8234-123456789abc'),
    setActive: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue('92345678-1234-4234-8234-123456789abc'),
    ...over,
  };
}

beforeEach(() => localStorage.clear());

describe('mensagens do banco', () => {
  it('repete só mensagens conhecidas', () => {
    expect(knownLocationMessage(MISMATCH_MESSAGE)).toBe(MISMATCH_MESSAGE);
    expect(knownLocationMessage('select * from secrets')).toBeNull();
    expect(knownLocationMessage(undefined)).toBeNull();
  });
  it('cada mensagem existe nas migrações', () => {
    const dir = 'supabase/migrations';
    const sql = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(`${dir}/${file}`, 'utf8'))
      .join('\n');
    for (const message of LOCATION_MESSAGES)
      expect(sql.includes(message), message).toBe(true);
  });
});

describe('locais da unidade', () => {
  it('o proprietário cria um local e o identificador muda depois do sucesso', async () => {
    const gateway = fake();
    render(<LocationsPanel scope={scope} gateway={gateway} canManage />);
    await screen.findByRole('list');
    await userEvent.type(screen.getByLabelText('Nome do local'), 'Freezer 2');
    await userEvent.selectOptions(
      screen.getByLabelText('Condição do local'),
      'frozen',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Criar local' }));
    await waitFor(() => expect(gateway.create).toHaveBeenCalledTimes(1));
    const first = vi.mocked(gateway.create).mock.calls[0]![1];
    expect(first).toMatchObject({ name: 'Freezer 2', condition: 'frozen' });
    await userEvent.type(screen.getByLabelText('Nome do local'), 'Outro');
    await userEvent.click(screen.getByRole('button', { name: 'Criar local' }));
    await waitFor(() => expect(gateway.create).toHaveBeenCalledTimes(2));
    expect(vi.mocked(gateway.create).mock.calls[1]![1].intentId).not.toBe(
      first.intentId,
    );
  });
  it('mostra a recusa do banco e permite desativar', async () => {
    const gateway = fake({
      create: vi
        .fn()
        .mockRejectedValue(
          new LocationRejected(
            'Já existe um local com esse nome nesta unidade.',
          ),
        ),
    });
    render(<LocationsPanel scope={scope} gateway={gateway} canManage />);
    await screen.findByRole('list');
    await userEvent.type(
      screen.getByLabelText('Nome do local'),
      'Câmara fria 01',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Criar local' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Já existe um local com esse nome',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Desativar Câmara fria 01' }),
    );
    await waitFor(() =>
      expect(gateway.setActive).toHaveBeenCalledWith(
        scope,
        place(1, '').id,
        false,
      ),
    );
  });
  it('quem não é proprietário só vê', async () => {
    render(<LocationsPanel scope={scope} gateway={fake()} canManage={false} />);
    await screen.findByRole('list');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText('Nome do local')).toBeNull();
  });
});

describe('mudar de local', () => {
  function open(gateway: LocationGateway, onMoved = vi.fn()) {
    render(
      <MoveContainer
        scope={scope}
        containerId={container}
        userId={user}
        gateway={gateway}
        loadMembers={() => Promise.resolve(people)}
        current={undefined}
        onMoved={onMoved}
        onClose={vi.fn()}
      />,
    );
    return onMoved;
  }
  it('registra o local com quem mudou e avisa que saldo e validade não mudam', async () => {
    const gateway = fake();
    const onMoved = open(gateway);
    expect(
      screen.getByText(/Não altera saldo, validade nem conservação/),
    ).toBeTruthy();
    await screen.findByRole('option', { name: /Câmara fria 01/ });
    await userEvent.selectOptions(
      screen.getByLabelText('Novo local'),
      place(1, '').id,
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Quem mudou o recipiente'),
      people[1]!.user_id,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Registrar local' }),
    );
    await waitFor(() => expect(gateway.move).toHaveBeenCalledTimes(1));
    expect(vi.mocked(gateway.move).mock.calls[0]![1]).toMatchObject({
      containerId: container,
      locationId: place(1, '').id,
      handledBy: people[1]!.user_id,
      confirmMismatch: false,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Local registrado',
    );
    expect(onMoved).toHaveBeenCalled();
  });
  it('divergência de condição só registra com a confirmação, com o mesmo identificador', async () => {
    const move = vi
      .fn()
      .mockRejectedValueOnce(
        new LocationRejected(MISMATCH_MESSAGE, false, true),
      )
      .mockResolvedValueOnce('92345678-1234-4234-8234-123456789abc');
    open(fake({ move }));
    await screen.findByRole('option', { name: /Câmara fria 01/ });
    await userEvent.selectOptions(
      screen.getByLabelText('Novo local'),
      place(1, '').id,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Registrar local' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'condição do local é diferente',
    );
    expect(move).toHaveBeenCalledTimes(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Registrar mesmo assim' }),
    );
    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
    expect(move.mock.calls[1]![1].confirmMismatch).toBe(true);
    expect(move.mock.calls[1]![1].intentId).toBe(
      move.mock.calls[0]![1].intentId,
    );
  });
  it('recusa do banco aparece e nada é registrado', async () => {
    const move = vi
      .fn()
      .mockRejectedValue(
        new LocationRejected('Local desativado; escolha outro local.'),
      );
    open(fake({ move }));
    await screen.findByRole('option', { name: /Câmara fria 01/ });
    await userEvent.selectOptions(
      screen.getByLabelText('Novo local'),
      place(1, '').id,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Registrar local' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Local desativado',
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('tentativa pendente de local', () => {
  function tracked(move: LocationGateway['move']): TrackedGateways {
    return { locations: fake({ move }) } as unknown as TrackedGateways;
  }
  const input = {
    containerId: container,
    locationId: place(1, '').id,
    handledBy: user,
    confirmMismatch: false,
    intentId: 'a2345678-1234-4234-8234-123456789abc',
  };
  it('conexão perdida mantém a tentativa; recusa definitiva a apaga; sucesso a apaga', async () => {
    await expect(
      trackGateways(
        tracked(vi.fn().mockRejectedValue(new Error('rede'))),
        user,
      ).locations!.move(scope, input),
    ).rejects.toThrow('rede');
    expect(pendingStore.list(user).map((item) => item.kind)).toEqual([
      'location_move',
    ]);
    await trackGateways(
      tracked(vi.fn().mockResolvedValue('x')),
      user,
    ).locations!.move(scope, input);
    expect(pendingStore.list(user)).toHaveLength(0);
    await expect(
      trackGateways(
        tracked(
          vi
            .fn()
            .mockRejectedValue(
              new LocationRejected('Local desativado; escolha outro local.'),
            ),
        ),
        user,
      ).locations!.move(scope, input),
    ).rejects.toBeInstanceOf(LocationRejected);
    expect(pendingStore.list(user)).toHaveLength(0);
  });
});

describe('gateway do Supabase', () => {
  it('traduz o código do banco e repete só mensagens conhecidas', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: '22023', message: MISMATCH_MESSAGE },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'x' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: '22023', message: 'texto interno do servidor' },
      });
    const gateway = createLocationGateway({ rpc } as unknown as SupabaseClient);
    const input = {
      containerId: container,
      locationId: place(1, '').id,
      handledBy: user,
      confirmMismatch: false,
      intentId: 'a2345678-1234-4234-8234-123456789abc',
    };
    const first = await gateway.move(scope, input).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(LocationRejected);
    expect((first as LocationRejected).needsConfirmation).toBe(true);
    const second = await gateway.move(scope, input).catch((e: unknown) => e);
    expect((second as LocationRejected).conflict).toBe(true);
    const third = (await gateway
      .move(scope, input)
      .catch((e: unknown) => e)) as Error;
    expect(third.message).not.toContain('texto interno');
  });
  it('lista os locais atuais pela função do banco', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          container_id: container,
          location_id: place(1, '').id,
          location_name: 'Câmara fria 01',
          location_condition: 'refrigerated',
          moved_at: '2026-11-14T00:00:00Z',
          handled_by_name: 'Luis',
          mismatch_confirmed: false,
        },
      ],
      error: null,
    });
    const rows = await createLocationGateway({
      rpc,
    } as unknown as SupabaseClient).currents(scope);
    expect(rpc).toHaveBeenCalledWith('list_container_locations', {
      p_organization_id: scope.organizationId,
      p_establishment_id: scope.establishmentId,
    });
    expect(rows[0]!.location_name).toBe('Câmara fria 01');
  });
});
