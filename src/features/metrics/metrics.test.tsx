import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UnitMetricsPanel } from './components/UnitMetricsPanel';
import type { MetricsGateway } from './application/metricsGateway';
import {
  elapsedText,
  metricsSchema,
  periodEnding,
  shareText,
  type UnitMetrics,
} from './domain/metrics';
import { createMetricsGateway } from './data/supabaseMetrics';
import type { SupabaseClient } from '@supabase/supabase-js';

const scope = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  establishmentId: '22222222-2222-4222-8222-222222222222',
};

const zero: UnitMetrics = {
  handlings_total: 0,
  handlings_same_expiry: 0,
  handlings_shorter_expiry: 0,
  handlings_late: 0,
  handling_delay_p50_seconds: null,
  handling_delay_max_seconds: null,
  occurrences_total: 0,
  occurrences_late_handling: 0,
  occurrences_undecided: 0,
  decisions_total: 0,
  decision_wait_p50_seconds: null,
  decision_wait_max_seconds: null,
  handling_voids_total: 0,
  location_moves_total: 0,
  containers_expired_with_balance: 0,
  productions_total: 0,
  productions_late: 0,
  production_delay_p50_seconds: null,
  production_delay_max_seconds: null,
  production_voids_total: 0,
  production_portionings_total: 0,
  occurrences_late_production: 0,
};

function tile(group: string, label: string) {
  const term = within(screen.getByRole('region', { name: group })).getByText(
    label,
    { selector: 'dt' },
  );
  return term.parentElement as HTMLElement;
}

describe('domínio dos indicadores', () => {
  it('lê contagens e tempos do banco, inclusive bigint em texto e tempo nulo', () => {
    const parsed = metricsSchema.parse({
      ...zero,
      handlings_total: '4',
      handling_delay_p50_seconds: '90',
    });
    expect(parsed.handlings_total).toBe(4);
    expect(parsed.handling_delay_p50_seconds).toBe(90);
    expect(parsed.decision_wait_max_seconds).toBeNull();
    expect(() =>
      metricsSchema.parse({ ...zero, handlings_total: -1 }),
    ).toThrow();
    expect(() =>
      metricsSchema.parse({ ...zero, productions_total: undefined }),
    ).toThrow();
  });

  it('formata tempos e participações sem inventar valor quando não há registro', () => {
    expect(elapsedText(null)).toBeNull();
    expect(elapsedText(20)).toBe('menos de 1 min');
    expect(elapsedText(12 * 60)).toBe('12 min');
    expect(elapsedText(2 * 3600)).toBe('2 h');
    expect(elapsedText(2 * 3600 + 5 * 60)).toBe('2 h 5 min');
    expect(elapsedText(3 * 86400 + 4 * 3600)).toBe('3 d 4 h');
    expect(shareText(1, 0)).toBeNull();
    expect(shareText(1, 4)).toBe('25% do total');
  });

  it('o período termina agora e respeita o limite do banco', () => {
    const now = new Date('2026-11-26T12:00:00Z');
    const period = periodEnding(now, 30);
    expect(period.to).toEqual(now);
    expect(period.from.toISOString()).toBe('2026-10-27T12:00:00.000Z');
    expect(
      periodEnding(now, 90).to.getTime() - periodEnding(now, 90).from.getTime(),
    ).toBeLessThanOrEqual(366 * 86_400_000);
  });
});

describe('gateway dos indicadores', () => {
  it('chama pilot_metrics com escopo e período e não repassa o erro técnico', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [zero], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'permission denied for table x', code: '42501' },
      });
    const gateway = createMetricsGateway({ rpc } as unknown as SupabaseClient);
    const period = {
      from: new Date('2026-11-01T00:00:00Z'),
      to: new Date('2026-11-26T00:00:00Z'),
    };
    await expect(gateway.read(scope, period)).resolves.toEqual(zero);
    expect(rpc).toHaveBeenCalledWith('pilot_metrics', {
      p_organization_id: scope.organizationId,
      p_establishment_id: scope.establishmentId,
      p_from: '2026-11-01T00:00:00.000Z',
      p_to: '2026-11-26T00:00:00.000Z',
    });
    await expect(gateway.read(scope, period)).rejects.toThrow(
      'Não foi possível consultar os indicadores da unidade.',
    );
  });
});

describe('painel de indicadores', () => {
  it('mostra os grupos, as participações e os tempos legíveis', async () => {
    const read = vi.fn().mockResolvedValue({
      ...zero,
      handlings_total: 4,
      handlings_same_expiry: 3,
      handlings_shorter_expiry: 1,
      handlings_late: 1,
      handling_delay_p50_seconds: 300,
      handling_delay_max_seconds: 3 * 3600,
      occurrences_total: 2,
      occurrences_late_handling: 1,
      occurrences_undecided: 1,
      decisions_total: 1,
      decision_wait_p50_seconds: 1800,
      decision_wait_max_seconds: 1800,
      containers_expired_with_balance: 2,
      productions_total: 5,
      productions_late: 0,
      production_portionings_total: 2,
      location_moves_total: 3,
    } satisfies UnitMetrics);
    const selectExpiry = vi.fn();
    render(
      <UnitMetricsPanel
        scope={scope}
        timezone="America/Sao_Paulo"
        gateway={{ read }}
        expiryHref={(filter) => `?area=validade&validade=${filter}`}
        selectExpiry={selectExpiry}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Indicadores' })).toBeVisible();
    expect(await screen.findByText(/Últimos 30 dias: de/)).toBeVisible();
    expect(read).toHaveBeenCalledTimes(1);
    const [, period] = read.mock.calls[0]!;
    expect(period.to.getTime() - period.from.getTime()).toBe(30 * 86_400_000);

    await userEvent.click(screen.getByText('Ver todos os indicadores'));
    const expired = tile('Situação agora', 'Recipientes vencidos com saldo');
    expect(expired).toHaveTextContent('2');
    expect(within(expired).getByText('2')).toHaveClass('mesa-danger');
    expect(tile('Abertura e porcionamento', 'Manipulações')).toHaveTextContent(
      '4',
    );
    expect(
      tile('Abertura e porcionamento', 'Com a validade da origem'),
    ).toHaveTextContent('75% do total');
    expect(
      tile('Abertura e porcionamento', 'Registradas com atraso'),
    ).toHaveTextContent('25% do total');
    expect(
      tile('Abertura e porcionamento', 'Tempo até o registro (mediana)'),
    ).toHaveTextContent('5 min');
    expect(
      tile('Abertura e porcionamento', 'Maior tempo até o registro'),
    ).toHaveTextContent('3 h');
    expect(
      tile('Produção da cozinha', 'Tempo até o registro (mediana)'),
    ).toHaveTextContent('—Sem registros no período');
    expect(
      tile('Produção da cozinha', 'Registradas com atraso'),
    ).toHaveTextContent('0% do total');
    expect(
      tile('Ocorrências e decisões', 'Ainda sem decisão'),
    ).toHaveTextContent('50% do total');
    expect(
      tile('Ocorrências e decisões', 'Espera pela decisão (mediana)'),
    ).toHaveTextContent('30 min');
    expect(tile('Armazenamento', 'Mudanças de local')).toHaveTextContent('3');

    await userEvent.click(
      screen.getByRole('link', { name: 'Ver vencidos em Validades' }),
    );
    expect(selectExpiry).toHaveBeenCalledWith('vencidos');
  });

  it('troca o período, atualiza e não mostra link de vencidos sem vencidos', async () => {
    const user = userEvent.setup();
    const read = vi.fn().mockResolvedValue(zero);
    render(
      <UnitMetricsPanel
        scope={scope}
        timezone="UTC"
        gateway={{ read }}
        expiryHref={() => '?'}
        selectExpiry={vi.fn()}
      />,
    );
    await screen.findByText(/Últimos 30 dias: de/);
    expect(
      screen.queryByRole('link', { name: 'Ver vencidos em Validades' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Últimos 30 dias' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Últimos 7 dias' }));
    await screen.findByText(/Últimos 7 dias: de/);
    expect(
      screen.getByRole('button', { name: 'Últimos 7 dias' }),
    ).toHaveAttribute('aria-pressed', 'true');
    const [, week] = read.mock.calls[1]!;
    expect(week.to.getTime() - week.from.getTime()).toBe(7 * 86_400_000);
    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    await screen.findByText(/Últimos 7 dias: de/);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('falha ao consultar: aviso sem detalhe técnico e nova tentativa', async () => {
    const user = userEvent.setup();
    const read = vi
      .fn<MetricsGateway['read']>()
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValue(zero);
    render(
      <UnitMetricsPanel scope={scope} timezone="UTC" gateway={{ read }} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os indicadores da unidade.',
    );
    expect(screen.queryByText('Manipulações')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText(/Últimos 30 dias: de/)).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('não usa palavras de ambiente interno nem afirma avaliação do alimento', async () => {
    const read = vi.fn().mockResolvedValue(zero);
    const { container } = render(
      <UnitMetricsPanel scope={scope} timezone="UTC" gateway={{ read }} />,
    );
    await screen.findByText(/Últimos 30 dias: de/);
    expect(container).not.toHaveTextContent(
      /teste|demo|piloto|supabase|pilot_metrics|seguro|conformidade/i,
    );
  });
  it('PR-08: barra de participação só com base; o texto equivalente continua e o zero real não vira barra', async () => {
    const read = vi.fn().mockResolvedValue({
      ...zero,
      handlings_total: 4,
      handlings_same_expiry: 3,
      handlings_late: 1,
      productions_total: 0,
    } satisfies UnitMetrics);
    render(
      <UnitMetricsPanel
        scope={scope}
        timezone="America/Sao_Paulo"
        gateway={{ read }}
      />,
    );
    await screen.findByText(/Últimos 30 dias: de/);
    await userEvent.click(screen.getByText('Ver todos os indicadores'));
    const same = tile('Abertura e porcionamento', 'Com a validade da origem');
    const bar = same.querySelector('progress');
    expect(bar).not.toBeNull();
    expect(bar).toHaveAttribute('value', '3');
    expect(bar).toHaveAttribute('max', '4');
    // A barra é reforço visual: fica fora da leitura; o número e "75% do total" são o texto.
    expect(bar!.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(same).toHaveTextContent('75% do total');
    // Sem base (produções = 0): "0" real, sem percentual e sem barra.
    const late = tile('Produção da cozinha', 'Registradas com atraso');
    expect(late.querySelector('progress')).toBeNull();
    expect(late).toHaveTextContent('0');
    expect(late).not.toHaveTextContent('%');
    // Contagens sem participação não têm barra.
    expect(
      tile('Abertura e porcionamento', 'Manipulações').querySelector(
        'progress',
      ),
    ).toBeNull();
    // Os grupos de período ficam juntos num bloco; "Situação agora" fica fora dele.
    expect(
      screen
        .getByRole('region', { name: 'Situação agora' })
        .closest('.metrics-groups'),
    ).toBeNull();
    expect(
      screen
        .getByRole('region', { name: 'Armazenamento' })
        .closest('.metrics-groups'),
    ).not.toBeNull();
  });
});

function chartRow(chart: string, label: string) {
  return within(screen.getByRole('region', { name: chart })).getByText(label, {
    selector: 'dt',
  }).parentElement as HTMLElement;
}

it('compara volumes na mesma escala e taxas com bases próprias, sem sumarizar atividades sobrepostas', async () => {
  const read = vi.fn().mockResolvedValue({
    ...zero,
    handlings_total: 4,
    handlings_late: 1,
    productions_total: 5,
    productions_late: 0,
    location_moves_total: 3,
    occurrences_undecided: 2,
  });
  render(<UnitMetricsPanel scope={scope} timezone="UTC" gateway={{ read }} />);
  await screen.findByText(/Últimos 30 dias: de/);
  expect(
    screen.getByRole('region', { name: 'Abertura e porcionamento' }),
  ).not.toBeVisible();
  for (const [label, value] of [
    ['Manipulações', '4'],
    ['Produções', '5'],
    ['Mudanças de local', '3'],
  ] as const) {
    const row = chartRow('Volume de registros', label);
    expect(row.querySelector('progress')).toHaveAttribute('value', value);
    expect(row.querySelector('progress')).toHaveAttribute('max', '5');
    expect(row.querySelector('progress')?.parentElement).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  }
  const handling = chartRow(
    'Proporção de registros com atraso',
    'Manipulações',
  );
  expect(handling).toHaveTextContent('25% do total');
  expect(handling).toHaveTextContent('1 de 4 registros');
  expect(handling.querySelector('progress')).toHaveAttribute('value', '25');
  expect(handling.querySelector('progress')).toHaveAttribute('max', '100');
  expect(
    chartRow('Proporção de registros com atraso', 'Produções'),
  ).toHaveTextContent('0% do total');
  expect(screen.getByRole('note')).toHaveTextContent(
    'Ocorrências do período ainda sem decisão: 2',
  );
  expect(read).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByText('Ver todos os indicadores'));
  expect(screen.getByRole('region', { name: 'Armazenamento' })).toBeVisible();
});

it('não desenha participação sem base e diferencia contagem zero de falta de registros', async () => {
  render(
    <UnitMetricsPanel
      scope={scope}
      timezone="UTC"
      gateway={{ read: vi.fn().mockResolvedValue(zero) }}
    />,
  );
  await screen.findByText(/Últimos 30 dias: de/);
  const late = screen.getByRole('region', {
    name: 'Proporção de registros com atraso',
  });
  expect(late.querySelector('progress')).toBeNull();
  expect(late).not.toHaveTextContent('%');
  expect(within(late).getAllByText('Sem registros no período')).toHaveLength(2);
  expect(
    screen.getByRole('region', { name: 'Volume de registros' }),
  ).toHaveTextContent('Nenhuma manipulação, produção ou mudança de local');
});

it('mantém o detalhamento aberto ao trocar período e remove gráficos antigos após falha', async () => {
  const user = userEvent.setup();
  const read = vi
    .fn()
    .mockResolvedValueOnce({ ...zero, productions_total: 8 })
    .mockResolvedValueOnce({ ...zero, productions_total: 2 })
    .mockRejectedValueOnce(new Error('offline'));
  render(<UnitMetricsPanel scope={scope} timezone="UTC" gateway={{ read }} />);
  await screen.findByText(/Últimos 30 dias: de/);
  expect(chartRow('Volume de registros', 'Produções')).toHaveTextContent('8');
  await user.click(screen.getByText('Ver todos os indicadores'));
  await user.click(screen.getByRole('button', { name: 'Últimos 7 dias' }));
  await screen.findByText(/Últimos 7 dias: de/);
  expect(chartRow('Volume de registros', 'Produções')).toHaveTextContent('2');
  expect(screen.getByRole('region', { name: 'Armazenamento' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Atualizar' }));
  await screen.findByRole('alert');
  expect(
    screen.queryByRole('region', { name: 'Volume de registros' }),
  ).not.toBeInTheDocument();
});
