import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { BatchPanel } from './BatchPanel';
import { containerRow, fakeContainers } from '../../../test/fakeContainers';

// V3 (B3, B4, M3, M6): cartões compactos, selo com texto, datas dd/mm/aaaa, UUID técnico não visível e
// ficha aberta direto pelo cartão, também para colaborador e recipiente derivado.
const catalog = () => ({
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  setStorageCondition: vi.fn(),
});
const batches = () => ({ list: vi.fn(), receive: vi.fn() });
const ids = {
  overdue: '40000000-0000-4000-8000-000000000001',
  today: '40000000-0000-4000-8000-000000000002',
  tomorrow: '40000000-0000-4000-8000-000000000003',
  later: '40000000-0000-4000-8000-000000000004',
};

function withFakeDate(run: () => Promise<void>) {
  return async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // 15/11/2026 às 12:00 em São Paulo.
      vi.setSystemTime(new Date('2026-11-15T15:00:00Z'));
      await run();
    } finally {
      vi.useRealTimers();
    }
  };
}

function rows() {
  return [
    containerRow({
      container_id: ids.overdue,
      product_name: 'Frango',
      expiry_date: '2026-11-12',
      balance: 2,
      initial_quantity: 4,
    }),
    containerRow({
      container_id: ids.today,
      product_name: 'Creme',
      expiry_date: '2026-11-15',
    }),
    containerRow({
      container_id: ids.tomorrow,
      product_name: 'Queijo',
      expiry_date: '2026-11-16',
      kind: 'derived',
      expiry_origin: 'handling',
    }),
    containerRow({
      container_id: ids.later,
      product_name: 'Arroz',
      source_code: null,
      expiry_date: '2026-12-15',
      batch_expiry_origin: 'responsible',
    }),
  ];
}

it(
  'mostra cada recipiente como cartão com selo em texto e datas brasileiras, sem UUID',
  withFakeDate(async () => {
    render(
      <BatchPanel
        scope={{ organizationId: 'org', establishmentId: 'unit' }}
        timezone="America/Sao_Paulo"
        userId="user"
        canCreate={false}
        catalog={catalog()}
        batches={batches()}
        containers={fakeContainers(rows())}
      />,
    );
    const list = await screen.findByRole('list', {
      name: 'Recipientes e validade',
    });
    const card = (name: string) =>
      within(list).getByRole('listitem', { name: new RegExp(`^${name} C-`) });
    expect(card('Frango')).toHaveTextContent('Vencido há 3 dias');
    expect(card('Frango')).toHaveTextContent('Validade 12/11/2026 (original)');
    expect(card('Frango')).toHaveTextContent('Saldo 2 kg de 4 kg');
    expect(card('Frango')).toHaveTextContent('VENCIDO - somente descarte');
    expect(card('Creme')).toHaveTextContent('Vence hoje');
    expect(card('Queijo')).toHaveTextContent('Vence amanhã');
    expect(card('Queijo')).toHaveTextContent('(derivado)');
    expect(card('Queijo')).toHaveTextContent(
      'Validade 16/11/2026 (após manipulação)',
    );
    expect(card('Arroz')).toHaveTextContent('Vence em 30 dias');
    expect(card('Arroz')).toHaveTextContent(
      'Validade 15/12/2026 (definida pelo responsável)',
    );
    expect(card('Arroz')).toHaveTextContent('· preparação própria');
    // O selo tem texto além da cor e o símbolo fica fora da leitura.
    const badge = within(card('Creme')).getByText('Vence hoje');
    expect(badge).toHaveClass('expiry-badge', 'tone-today');
    expect(badge.querySelector('[aria-hidden="true"]')).not.toBeNull();
    // Nenhum UUID completo na lista principal, nem data ISO.
    expect(list.textContent).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
    expect(list.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // Explicação e data de referência logo abaixo da lista, em formato brasileiro.
    const notes = screen.getByText(/^Data de referência:/);
    expect(notes).toHaveTextContent('Data de referência: 15/11/2026.');
    expect(notes).toHaveTextContent(
      /Última consulta: 15\/11\/2026 12:00 \(relógio deste dispositivo\)/,
    );
    expect(notes).toHaveTextContent(/\(America\/Sao_Paulo\)/);
    expect(notes.textContent).not.toMatch(/T\d{2}:\d{2}/);
    expect(
      list.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }),
);

it('abre a ficha pelo cartão para colaborador e derivado, e volta ao mesmo cartão', async () => {
  const user = userEvent.setup();
  const all = rows();
  const derived = all[2]!;
  const get = vi.fn().mockResolvedValue({
    id: derived.container_id,
    short_code: derived.short_code,
    balance: 1,
    kind: 'derived',
    batch_receipts: {
      source_code: derived.source_code,
      quantity: 1,
      unit: 'kg',
      expiry_date: '2030-01-01',
      expiry_origin: 'original' as const,
      products: { name: 'Queijo' },
    },
  });
  const ensure = vi.fn();
  render(
    <BatchPanel
      scope={{ organizationId: 'org', establishmentId: 'unit' }}
      timezone="America/Sao_Paulo"
      userId="user"
      canCreate={false}
      catalog={catalog()}
      batches={batches()}
      containers={fakeContainers(all)}
      labels={{ ensure, get }}
    />,
  );
  const list = await screen.findByRole('list', {
    name: 'Recipientes e validade',
  });
  const card = within(list).getByRole('listitem', { name: /^Queijo C-/ });
  const open = within(card).getByRole('button', { name: 'Ver ficha' });
  await user.click(open);
  const ficha = await screen.findByRole('region', { name: 'Recipiente' });
  expect(ficha).toBeVisible();
  expect(get).toHaveBeenCalledWith(derived.container_id);
  // Leitura só: abrir a ficha não chama a função de escrita.
  expect(ensure).not.toHaveBeenCalled();
  // A lista fica oculta (sem perder a busca) enquanto a ficha está aberta.
  expect(list).not.toBeVisible();
  // A ficha não expõe o UUID técnico como texto da interface.
  expect(ficha).not.toHaveTextContent(derived.container_id);
  await waitFor(() =>
    expect(ficha).toHaveAttribute('data-container-id', derived.container_id),
  );
  await user.click(
    screen.getByRole('button', { name: '← Voltar para a lista' }),
  );
  expect(
    screen.queryByRole('region', { name: 'Recipiente' }),
  ).not.toBeInTheDocument();
  expect(list).toBeVisible();
  await vi.waitFor(() => expect(open).toHaveFocus());
});
