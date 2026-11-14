import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { LabelView } from './LabelView';
import { makeLabelPdf } from '../application/pdf';

vi.mock('../application/pdf', () => ({
  makeLabelPdf: vi.fn().mockRejectedValue(new Error('Falha ao gerar PDF.')),
}));

it('não inicia download se a tela for fechada durante a geração do PDF', async () => {
  const user = userEvent.setup();
  const data = {
    id: '12345678-1234-4234-8234-123456789abc',
    short_code: 'C-000001',
    balance: 1,
    batch_receipts: {
      source_code: '0001',
      quantity: 1,
      unit: 'kg',
      expiry_date: '2027-01-01',
      expiry_origin: 'original' as const,
      products: { name: 'Arroz' },
    },
  };
  let resolve!: (value: Blob) => void;
  const pending = new Promise<Blob>((done) => {
    resolve = done;
  });
  vi.mocked(makeLabelPdf).mockReturnValueOnce(pending);
  const create = vi.fn();
  vi.stubGlobal('URL', { ...URL, createObjectURL: create });
  const view = render(
    <LabelView
      id={data.id}
      gateway={{ ensure: vi.fn(), get: vi.fn().mockResolvedValue(data) }}
    />,
  );
  await user.click(
    await screen.findByRole('button', { name: 'Gerar etiqueta PDF' }),
  );
  expect(screen.getByText(/O QR usa endereço local/)).toBeVisible();
  view.unmount();
  await act(async () => {
    resolve(new Blob());
    await pending;
  });
  expect(create).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('não gera arquivo depois que a visualização foi desmontada durante a consulta', async () => {
  const user = userEvent.setup();
  const data = {
    id: '12345678-1234-4234-8234-123456789abc',
    short_code: 'C-000001',
    balance: 1,
    batch_receipts: {
      source_code: '0001',
      quantity: 1,
      unit: 'kg',
      expiry_date: '2027-01-01',
      expiry_origin: 'original' as const,
      products: { name: 'Arroz' },
    },
  };
  let resolve!: (value: typeof data) => void;
  const pending = new Promise<typeof data>((done) => {
    resolve = done;
  });
  const get = vi.fn().mockResolvedValueOnce(data).mockReturnValueOnce(pending);
  const view = render(
    <LabelView id={data.id} gateway={{ ensure: vi.fn(), get }} />,
  );
  await user.click(
    await screen.findByRole('button', { name: 'Gerar etiqueta PDF' }),
  );
  vi.mocked(makeLabelPdf).mockClear();
  view.unmount();
  await act(async () => {
    resolve(data);
    await pending;
  });
  expect(makeLabelPdf).not.toHaveBeenCalled();
});

it('não revela dados quando a consulta é negada', async () => {
  render(
    <LabelView
      id="12345678-1234-4234-8234-123456789abc"
      gateway={{
        ensure: vi.fn(),
        get: vi.fn().mockRejectedValue(new Error('negado')),
      }}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Recipiente indisponível ou sem acesso.',
  );
  expect(
    screen.queryByRole('button', { name: 'Gerar etiqueta PDF' }),
  ).not.toBeInTheDocument();
});

it('mantém o recipiente e permite tentar novamente se a geração do PDF falha', async () => {
  const user = userEvent.setup();
  const data = {
    id: '12345678-1234-4234-8234-123456789abc',
    short_code: 'C-000001',
    balance: 1,
    batch_receipts: {
      source_code: '0001',
      quantity: 1,
      unit: 'kg',
      expiry_date: '2027-01-01',
      expiry_origin: 'original' as const,
      products: { name: 'Arroz' },
    },
  };
  render(
    <LabelView
      id={data.id}
      gateway={{ ensure: vi.fn(), get: vi.fn().mockResolvedValue(data) }}
    />,
  );
  await user.click(
    await screen.findByRole('button', { name: 'Gerar etiqueta PDF' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Falha ao gerar PDF.',
  );
  expect(
    screen.getByRole('button', { name: 'Gerar etiqueta PDF' }),
  ).toBeEnabled();
  expect(screen.getByText(/Arroz — lote 0001/)).toBeVisible();
});

it('retira os dados se a nova consulta negar acesso ao gerar PDF', async () => {
  const user = userEvent.setup();
  const data = {
    id: '12345678-1234-4234-8234-123456789abc',
    short_code: 'C-000001',
    balance: 1,
    batch_receipts: {
      source_code: '0001',
      quantity: 1,
      unit: 'kg',
      expiry_date: '2027-01-01',
      expiry_origin: 'original' as const,
      products: { name: 'Arroz' },
    },
  };
  const get = vi
    .fn()
    .mockResolvedValueOnce(data)
    .mockRejectedValueOnce(new Error('negado'));
  render(<LabelView id={data.id} gateway={{ ensure: vi.fn(), get }} />);
  await user.click(
    await screen.findByRole('button', { name: 'Gerar etiqueta PDF' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Recipiente indisponível ou sem acesso.',
  );
  expect(screen.queryByText(/Arroz — lote 0001/)).not.toBeInTheDocument();
});

it('mostra o saldo do servidor e o código curto, e avisa quando esgotado (fatia 6.2)', async () => {
  const base = {
    id: '12345678-1234-4234-8234-123456789abc',
    short_code: 'C-000042',
    batch_receipts: {
      source_code: '0001',
      quantity: 5,
      unit: 'kg',
      expiry_date: '2027-01-01',
      expiry_origin: 'original' as const,
      products: { name: 'Arroz' },
    },
  };
  const { unmount } = render(
    <LabelView
      id={base.id}
      gateway={{
        ensure: vi.fn(),
        get: vi.fn().mockResolvedValue({ ...base, balance: 3.5 }),
      }}
    />,
  );
  expect(await screen.findByText('Saldo atual: 3.5 kg')).toBeVisible();
  expect(screen.getByText('Código: C-000042')).toBeVisible();
  expect(screen.queryByText(/esgotado/)).not.toBeInTheDocument();
  unmount();
  render(
    <LabelView
      id={base.id}
      gateway={{
        ensure: vi.fn(),
        get: vi.fn().mockResolvedValue({ ...base, balance: 0 }),
      }}
    />,
  );
  expect(
    await screen.findByText(
      'Saldo atual: 0 kg — esgotado, sem saldo neste recipiente',
    ),
  ).toBeVisible();
});

it('recusa gerar etiqueta de recipiente cuja manipulação foi anulada (fatia 6.4)', async () => {
  const data = {
    id: '12345678-1234-4234-8234-123456789abc',
    short_code: 'C-000002',
    balance: 0,
    voided: true,
    batch_receipts: {
      source_code: '0001',
      quantity: 1,
      unit: 'kg',
      expiry_date: '2027-01-01',
      expiry_origin: 'original' as const,
      products: { name: 'Arroz' },
    },
  };
  vi.mocked(makeLabelPdf).mockClear();
  render(
    <LabelView
      id={data.id}
      gateway={{ ensure: vi.fn(), get: vi.fn().mockResolvedValue(data) }}
    />,
  );
  expect(
    await screen.findByText(
      /Manipulação anulada: este recipiente não vale mais e a etiqueta não pode ser gerada/,
    ),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Gerar etiqueta PDF' }),
  ).toBeNull();
  expect(makeLabelPdf).not.toHaveBeenCalled();
});

it('recusa gerar etiqueta de derivado de manipulação tardia sem liberação (fatia 6.5a)', async () => {
  const data = {
    id: '12345678-1234-4234-8234-123456789abc',
    short_code: 'C-000003',
    balance: 2,
    late_hold: true,
    batch_receipts: {
      source_code: '0001',
      quantity: 1,
      unit: 'kg',
      expiry_date: '2027-01-01',
      expiry_origin: 'original' as const,
      products: { name: 'Arroz' },
    },
  };
  vi.mocked(makeLabelPdf).mockClear();
  render(
    <LabelView
      id={data.id}
      gateway={{ ensure: vi.fn(), get: vi.fn().mockResolvedValue(data) }}
    />,
  );
  expect(
    await screen.findByText(/fora da janela de horário, sem liberação/),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Gerar etiqueta PDF' }),
  ).toBeNull();
  expect(makeLabelPdf).not.toHaveBeenCalled();
});

it('mostra a faixa de bloqueio e mantém a etiqueta disponível (fatia 6.5b)', async () => {
  const base = {
    id: '12345678-1234-4234-8234-123456789abc',
    short_code: 'C-000004',
    balance: 2,
    batch_receipts: {
      source_code: '0001',
      quantity: 2,
      unit: 'kg',
      expiry_date: '2027-01-01',
      expiry_origin: 'original' as const,
      products: { name: 'Frango' },
    },
  };
  const view = render(
    <LabelView
      id={base.id}
      gateway={{
        ensure: vi.fn(),
        get: vi.fn().mockResolvedValue({ ...base, hold: 'pending' }),
      }}
    />,
  );
  expect(
    await screen.findByText('BLOQUEADO - aguardando decisão'),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Gerar etiqueta PDF' }),
  ).toBeVisible();
  view.unmount();
  render(
    <LabelView
      id={base.id}
      gateway={{
        ensure: vi.fn(),
        get: vi.fn().mockResolvedValue({ ...base, hold: 'rejected' }),
      }}
    />,
  );
  expect(await screen.findByText('REJEITADO - somente descarte')).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Só o descarte é permitido',
  );
});

it('derivado tardio sem liberação não mostra a faixa de etiqueta disponível', async () => {
  render(
    <LabelView
      id="12345678-1234-4234-8234-123456789abc"
      gateway={{
        ensure: vi.fn(),
        get: vi.fn().mockResolvedValue({
          id: '12345678-1234-4234-8234-123456789abc',
          short_code: 'C-000005',
          balance: 1,
          late_hold: true,
          hold: 'pending',
          batch_receipts: {
            source_code: '0001',
            quantity: 1,
            unit: 'kg',
            expiry_date: '2027-01-01',
            expiry_origin: 'original' as const,
            products: { name: 'Frango' },
          },
        }),
      }}
    />,
  );
  expect(
    await screen.findByText(/fora da janela de horário, sem liberação/),
  ).toBeVisible();
  expect(screen.queryByText('BLOQUEADO - aguardando decisão')).toBeNull();
});

it('mostra a faixa VENCIDO no QR só para recipiente vencido com saldo (fatia 6.11)', async () => {
  const base = {
    id: '12345678-1234-4234-8234-123456789abc',
    short_code: 'C-000011',
    balance: 2,
    batch_receipts: {
      source_code: '0001',
      quantity: 2,
      unit: 'kg',
      expiry_date: '2000-01-01',
      expiry_origin: 'original' as const,
      timezone: 'America/Sao_Paulo',
      products: { name: 'Arroz' },
    },
  };
  const show = (data: object) =>
    render(
      <LabelView
        id={base.id}
        gateway={{ ensure: vi.fn(), get: vi.fn().mockResolvedValue(data) }}
      />,
    );
  let view = show(base);
  expect(await screen.findByText('VENCIDO - somente descarte')).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(
    'O consumo é recusado; o descarte continua permitido.',
  );
  // A etiqueta continua disponível (reimpressão), como no bloqueio.
  expect(
    screen.getByRole('button', { name: 'Gerar etiqueta PDF' }),
  ).toBeVisible();
  view.unmount();
  // Vale a validade do próprio recipiente (derivado), não a do recebimento.
  view = show({
    ...base,
    effective: {
      expiry_date: '2999-12-31',
      expiry_origin: 'handling',
      initial_quantity: 2,
    },
  });
  expect(await screen.findByText('Saldo atual: 2 kg')).toBeVisible();
  expect(screen.queryByText(/VENCIDO/)).not.toBeInTheDocument();
  view.unmount();
  view = show({ ...base, balance: 0 });
  expect(await screen.findByText(/esgotado/)).toBeVisible();
  expect(screen.queryByText(/VENCIDO/)).not.toBeInTheDocument();
  view.unmount();
  show({ ...base, voided: true });
  expect(await screen.findByText(/Manipulação anulada/)).toBeVisible();
  expect(screen.queryByText(/VENCIDO/)).not.toBeInTheDocument();
});
