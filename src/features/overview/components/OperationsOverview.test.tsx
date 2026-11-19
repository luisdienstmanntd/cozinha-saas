import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { OperationsOverview } from './OperationsOverview';

it('usa o resumo do servidor e distingue a lista de alertas vazia dos totais', async () => {
  const summary = vi
    .fn()
    .mockResolvedValue({
      overdue: 125,
      due_today: 32,
      due_tomorrow: 4,
      later: 920,
    });
  const list = vi.fn().mockResolvedValue({ rows: [], next: null });
  const scope = { organizationId: 'org', establishmentId: 'unidade' };
  render(
    <OperationsOverview
      scope={scope}
      timezone="America/Sao_Paulo"
      containers={{ summary, list, get: vi.fn() }}
      occurrences={{ list: vi.fn().mockResolvedValue([]), decide: vi.fn() }}
      revision={0}
      areas={[{ id: 'validade', label: 'Validades' }]}
      select={vi.fn()}
    />,
  );
  expect(await screen.findByText('125')).toBeVisible();
  expect(screen.getByText('920')).toBeVisible();
  expect(screen.getByText(/Nenhum recipiente com saldo/)).toBeVisible();
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
