// Fatia 7.6: configurações da unidade (domínio, gateway e tela). Dados sintéticos.
import { readFileSync, readdirSync } from 'node:fs';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SettingsRejected } from './application/settingsGateway';
import type { SettingsGateway } from './application/settingsGateway';
import { createSettingsGateway } from './data/supabaseSettings';
import {
  DEFAULT_SETTINGS,
  SETTINGS_MESSAGES,
  durationText,
  knownSettingsMessage,
} from './domain/settings';
import type { EstablishmentSettings } from './domain/settings';
import { MEMBER_MODE_TEXT, SettingsPanel } from './components/SettingsPanel';

const id = (n: number) =>
  `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
const scope = { organizationId: id(1), establishmentId: id(2) };

describe('domínio das configurações', () => {
  it('escreve a duração como o banco', () => {
    expect(durationText(120)).toBe('2 horas');
    expect(durationText(60)).toBe('1 hora');
    expect(durationText(90)).toBe('1 hora e 30 minutos');
    expect(durationText(61)).toBe('1 hora e 1 minuto');
    expect(durationText(45)).toBe('45 minutos');
    expect(durationText(1440)).toBe('24 horas');
  });
  it('padrões são as regras de antes da 7.6', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      production_registrar: 'owner',
      production_window_minutes: 120,
      unlabeled_limit_minutes: 60,
      portion_expiry_rule: 'equal',
    });
  });
  it('repete só mensagens conhecidas, e cada uma existe nas migrações', () => {
    expect(knownSettingsMessage(SETTINGS_MESSAGES[0])).toBe(
      SETTINGS_MESSAGES[0],
    );
    expect(knownSettingsMessage('relation "x" does not exist')).toBeNull();
    const dir = 'supabase/migrations';
    const sql = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(`${dir}/${file}`, 'utf8'))
      .join('\n');
    for (const message of SETTINGS_MESSAGES)
      expect(sql.includes(message), message).toBe(true);
  });
});

describe('gateway das configurações', () => {
  function reading(data: unknown) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    };
    return { from: vi.fn(() => chain), chain };
  }
  it('sem linha gravada, devolve os padrões; com linha, os valores dela', async () => {
    const empty = reading(null);
    expect(
      await createSettingsGateway(empty as unknown as SupabaseClient).get(
        scope,
      ),
    ).toEqual(DEFAULT_SETTINGS);
    expect(empty.from).toHaveBeenCalledWith('establishment_settings');
    expect(empty.chain.eq).toHaveBeenCalledWith(
      'establishment_id',
      scope.establishmentId,
    );
    const saved = { ...DEFAULT_SETTINGS, production_registrar: 'member' };
    expect(
      await createSettingsGateway(
        reading(saved) as unknown as SupabaseClient,
      ).get(scope),
    ).toEqual(saved);
  });
  it('salva pela função do banco; recusa conhecida é definitiva, sem código fica incerto', async () => {
    const next: EstablishmentSettings = {
      production_registrar: 'member',
      production_window_minutes: 90,
      unlabeled_limit_minutes: 45,
      portion_expiry_rule: 'equal_or_less',
    };
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { ...next, updated_by: id(3) }, error: null });
    expect(
      await createSettingsGateway({ rpc } as unknown as SupabaseClient).save(
        scope,
        next,
      ),
    ).toEqual(next);
    expect(rpc).toHaveBeenCalledWith('set_establishment_settings', {
      p_organization_id: scope.organizationId,
      p_establishment_id: scope.establishmentId,
      p_production_registrar: 'member',
      p_production_window_minutes: 90,
      p_unlabeled_limit_minutes: 45,
      p_portion_expiry_rule: 'equal_or_less',
    });
    const answer = (error: { code?: string; message: string }) =>
      createSettingsGateway({
        rpc: vi.fn().mockResolvedValue({ data: null, error }),
      } as unknown as SupabaseClient)
        .save(scope, next)
        .catch((e: unknown) => e);
    const known = await answer({
      code: '22023',
      message: SETTINGS_MESSAGES[0],
    });
    expect(known).toBeInstanceOf(SettingsRejected);
    expect((known as Error).message).toBe(SETTINGS_MESSAGES[0]);
    const denied = await answer({ code: '42501', message: 'Acesso negado.' });
    expect((denied as Error).message).toBe(
      'Somente o proprietário muda as configurações da unidade.',
    );
    const lost = await answer({ message: 'Failed to fetch' });
    expect(lost).not.toBeInstanceOf(SettingsRejected);
    await expect(
      createSettingsGateway({ rpc } as unknown as SupabaseClient).save(scope, {
        ...next,
        production_window_minutes: 10,
      }),
    ).rejects.toThrow();
  });
});

describe('tela de configurações', () => {
  function gateway(current: EstablishmentSettings = DEFAULT_SETTINGS) {
    return {
      get: vi.fn().mockResolvedValue(current),
      save: vi.fn(async (_scope: unknown, next: EstablishmentSettings) => next),
    } satisfies SettingsGateway;
  }
  it('todos leem; só o proprietário vê "Alterar configurações"', async () => {
    render(<SettingsPanel scope={scope} gateway={gateway()} canEdit={false} />);
    const list = within(
      await screen.findByRole('list', { name: 'Configurações em vigor' }),
    );
    expect(
      list.getByText('Quem registra produção: Só o proprietário'),
    ).toBeVisible();
    expect(
      list.getByText(/Janela de registro da produção: 2 horas\./),
    ).toBeVisible();
    expect(list.getByText(/Tempo máximo sem etiqueta: 1 hora\./)).toBeVisible();
    expect(
      list.getByText('Porção de preparação própria: Igual à validade do lote'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Somente o proprietário muda as configurações da unidade.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Alterar configurações' }),
    ).toBeNull();
  });
  it('proprietário muda em passos: formulário, revisão com antes e depois, confirmação', async () => {
    const settings = gateway();
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(
      <SettingsPanel
        scope={scope}
        gateway={settings}
        canEdit
        onSaved={onSaved}
      />,
    );
    await user.click(
      await screen.findByRole('button', { name: 'Alterar configurações' }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Alterar configurações' }),
    );
    await user.click(
      form.getByRole('button', { name: 'Revisar configurações' }),
    );
    expect(form.getByRole('alert')).toHaveTextContent(
      'Nenhuma configuração foi alterada.',
    );
    const window = form.getByLabelText(
      'Janela de registro da produção (minutos)',
    );
    await user.clear(window);
    await user.type(window, '10');
    await user.click(
      form.getByRole('button', { name: 'Revisar configurações' }),
    );
    expect(form.getByRole('alert')).toHaveTextContent(
      'entre 15 minutos e 24 horas',
    );
    await user.clear(window);
    await user.type(window, '90');
    expect(form.getByText(/\(1 hora e 30 minutos\)/)).toBeVisible();
    await user.click(
      form.getByLabelText('Cada colaborador registra a própria produção'),
    );
    await user.click(
      form.getByRole('button', { name: 'Revisar configurações' }),
    );
    const review = within(
      screen.getByRole('region', { name: 'Revisão das configurações' }),
    );
    expect(
      review.getByText(
        'Quem registra produção: Só o proprietário → Cada colaborador registra a própria produção',
      ),
    ).toBeVisible();
    expect(
      review.getByText(
        'Janela de registro da produção: 2 horas → 1 hora e 30 minutos',
      ),
    ).toBeVisible();
    expect(review.queryByText(/Tempo máximo sem etiqueta/)).toBeNull();
    expect(review.getByText(MEMBER_MODE_TEXT)).toBeVisible();
    expect(settings.save).not.toHaveBeenCalled();
    await user.click(
      review.getByRole('button', { name: 'Confirmar configurações' }),
    );
    await waitFor(() => expect(settings.save).toHaveBeenCalledTimes(1));
    expect(settings.save.mock.calls[0]![1]).toEqual({
      production_registrar: 'member',
      production_window_minutes: 90,
      unlabeled_limit_minutes: 60,
      portion_expiry_rule: 'equal',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Configurações salvas. Valem para os registros novos',
    );
    expect(
      screen.getByText(
        'Quem registra produção: Cada colaborador registra a própria produção',
      ),
    ).toBeVisible();
    expect(onSaved).toHaveBeenCalled();
  });
  it('recusa do banco volta ao formulário; resultado incerto relê a configuração', async () => {
    const settings = gateway();
    settings.save
      .mockRejectedValueOnce(new SettingsRejected(SETTINGS_MESSAGES[1]))
      .mockRejectedValueOnce(
        new Error('Não foi possível confirmar o salvamento.'),
      );
    const user = userEvent.setup();
    render(<SettingsPanel scope={scope} gateway={settings} canEdit />);
    await user.click(
      await screen.findByRole('button', { name: 'Alterar configurações' }),
    );
    await user.click(
      screen.getByLabelText(
        'Igual ou menor que a validade do lote (nunca maior)',
      ),
    );
    await user.click(
      screen.getByRole('button', { name: 'Revisar configurações' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirmar configurações' }),
    );
    const form = within(
      await screen.findByRole('form', { name: 'Alterar configurações' }),
    );
    expect(form.getByRole('alert')).toHaveTextContent(SETTINGS_MESSAGES[1]);
    await user.click(
      form.getByRole('button', { name: 'Revisar configurações' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirmar configurações' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível confirmar o salvamento.',
    );
    await waitFor(() => expect(settings.get).toHaveBeenCalledTimes(2));
  });
});
