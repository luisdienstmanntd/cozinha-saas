import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { OperationsOverview } from './OperationsOverview';

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
