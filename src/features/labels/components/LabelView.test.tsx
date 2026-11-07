import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { LabelView } from './LabelView';

vi.mock('../application/pdf', () => ({
  makeLabelPdf: vi.fn().mockRejectedValue(new Error('Falha ao gerar PDF.')),
}));

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
