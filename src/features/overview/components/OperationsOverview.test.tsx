import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { OperationsOverview } from './OperationsOverview';
import { localCivilDate } from '../../batches/domain/expiryStatus';

it('orienta a consultar Validades quando os totais indicam urgência e a lista vem vazia', async () => {
  const summary = vi.fn().mockResolvedValue({
    overdue: 125,
    due_today: 32,
    due_tomorrow: 4,
    later: 920,
  });
  const list = vi.fn().mockResolvedValue({ rows: [], next: null });
  const scope = { organizationId: 'org', establishmentId: 'unidade' };
  const select = vi.fn();
  render(
    <OperationsOverview
      scope={scope}
      timezone="America/Sao_Paulo"
      containers={{ summary, list, get: vi.fn() }}
      occurrences={{ list: vi.fn().mockResolvedValue([]), decide: vi.fn() }}
      revision={0}
      areas={[{ id: 'validade', label: 'Validades' }]}
      select={select}
    />,
  );
  expect(await screen.findByText('125')).toBeVisible();
  expect(screen.getByText('920')).toBeVisible();
  expect(screen.getByText(/totais mostram recipientes vencidos/)).toBeVisible();
  expect(screen.getByText(/consulte Validades/i)).toBeVisible();
  expect(screen.queryByText(/Nenhum recipiente com saldo/)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Ver todos' }));
  expect(select).toHaveBeenCalledWith('validade');
  expect(summary).toHaveBeenCalledWith(
    scope,
    expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  );
  expect(list).toHaveBeenCalledWith(scope, {
    includeDepleted: false,
    search: '',
    after: null,
  });
  expect(
    screen.queryByRole('button', { name: '+ Recebimento' }),
  ).not.toBeInTheDocument();
});

it('mantém a mensagem sem alertas quando as contagens de urgência são zero', async () => {
  render(
    <OperationsOverview
      scope={{ organizationId: 'org', establishmentId: 'unidade' }}
      timezone="America/Sao_Paulo"
      containers={{
        summary: vi.fn().mockResolvedValue({
          overdue: 0,
          due_today: 0,
          due_tomorrow: 0,
          later: 3,
        }),
        list: vi.fn().mockResolvedValue({ rows: [], next: null }),
        get: vi.fn(),
      }}
      occurrences={{ list: vi.fn().mockResolvedValue([]), decide: vi.fn() }}
      revision={0}
      areas={[]}
      select={vi.fn()}
    />,
  );
  expect(await screen.findByText(/Nenhum recipiente com saldo/)).toBeVisible();
  expect(screen.queryByText(/totais mostram recipientes vencidos/)).toBeNull();
});

it('V6: cada contador leva a Validades filtrada, sem impedir abrir em outra aba', async () => {
  const summary = vi.fn().mockResolvedValue({
    overdue: 3,
    due_today: 2,
    due_tomorrow: 1,
    later: 9,
  });
  const list = vi.fn().mockResolvedValue({ rows: [], next: null });
  const selectExpiry = vi.fn();
  render(
    <OperationsOverview
      scope={{ organizationId: 'org', establishmentId: 'unidade' }}
      timezone="America/Sao_Paulo"
      containers={{ summary, list, get: vi.fn() }}
      occurrences={{ list: vi.fn().mockResolvedValue([]), decide: vi.fn() }}
      revision={0}
      areas={[{ id: 'validade', label: 'Validades' }]}
      select={vi.fn()}
      expiryHref={(filter) => `/?area=validade&validade=${filter}`}
      selectExpiry={selectExpiry}
    />,
  );
  const overdue = await screen.findByRole('link', { name: /Vencidos\s*3/ });
  expect(overdue).toHaveAttribute('href', '/?area=validade&validade=vencidos');
  expect(screen.getByRole('link', { name: /Vencem hoje\s*2/ })).toHaveAttribute(
    'href',
    '/?area=validade&validade=hoje',
  );
  expect(
    screen.getByRole('link', { name: /Vencem amanhã\s*1/ }),
  ).toHaveAttribute('href', '/?area=validade&validade=amanha');
  expect(screen.getByRole('link', { name: /Após amanhã\s*9/ })).toHaveAttribute(
    'href',
    '/?area=validade&validade=posteriores',
  );
  fireEvent.click(overdue);
  expect(selectExpiry).toHaveBeenCalledWith('vencidos');
  // Ctrl+clique segue o link normal (nova aba), sem trocar a área aqui.
  fireEvent.click(screen.getByRole('link', { name: /Vencem hoje/ }), {
    ctrlKey: true,
  });
  expect(selectExpiry).toHaveBeenCalledTimes(1);
});

it('PR-04: a lista de atenção usa o selo único e "vence hoje" difere de "vence amanhã"', async () => {
  const timezone = 'America/Sao_Paulo';
  const civil = (offset: number) =>
    localCivilDate(new Date(Date.now() + offset * 86_400_000), timezone);
  const row = (id: string, name: string, offset: number) => ({
    container_id: `30000000-0000-4000-8000-00000000000${id.slice(1)}`,
    product_name: name,
    short_code: id,
    source_code: null,
    expiry_date: civil(offset),
  });
  render(
    <OperationsOverview
      scope={{ organizationId: 'org', establishmentId: 'unidade' }}
      timezone={timezone}
      containers={{
        summary: vi.fn().mockResolvedValue({
          overdue: 1,
          due_today: 1,
          due_tomorrow: 1,
          later: 0,
        }),
        list: vi.fn().mockResolvedValue({
          rows: [
            row('A1', 'Caldo', -2),
            row('B2', 'Molho', 0),
            row('C3', 'Creme', 1),
          ],
          next: null,
        } as never),
        get: vi.fn(),
      }}
      occurrences={{ list: vi.fn().mockResolvedValue([]), decide: vi.fn() }}
      revision={0}
      areas={[{ id: 'validade', label: 'Validades' }]}
      select={vi.fn()}
    />,
  );
  const overdue = await screen.findByText('Vencido há 2 dias');
  const today = screen.getByText('Vence hoje');
  const tomorrow = screen.getByText('Vence amanhã');
  expect(overdue).toHaveClass('ui-badge', 'ui-badge-overdue');
  expect(today).toHaveClass('ui-badge', 'ui-badge-today');
  expect(tomorrow).toHaveClass('ui-badge', 'ui-badge-tomorrow');
  for (const badge of [overdue, today, tomorrow])
    expect(badge.querySelector('[aria-hidden="true"]')).not.toBeNull();
});
