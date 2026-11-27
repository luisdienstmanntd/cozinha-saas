import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { LabelPreview } from './LabelPreview';
import { makeLabelPdf } from '../application/pdf';
import { setOfficialOrigin } from '../application/labelOrigin';
import { BLOCK_TEXT } from '../../occurrences/domain/occurrence';
import type { LabelData } from '../domain/label';

const ORIGIN = 'https://cozzigo.pages.dev';
beforeEach(() => setOfficialOrigin(ORIGIN));
afterEach(() => setOfficialOrigin(null));

const receipt: LabelData = {
  id: '12345678-1234-4234-8234-123456789abc',
  short_code: 'C-000001',
  balance: 1,
  storage: 'ambient',
  batch_receipts: {
    source_code: '0001',
    quantity: 1.25,
    unit: 'kg',
    expiry_date: '2027-01-01',
    expiry_origin: 'original',
    suppliers: { name: 'Horta' },
    products: { name: 'Arroz' },
  },
};
const portion: LabelData = {
  ...receipt,
  id: '22345678-1234-4234-8234-123456789abc',
  short_code: 'C-000002',
  kind: 'derived',
  storage: 'refrigerated',
  effective: {
    expiry_date: '2026-12-01',
    expiry_origin: 'handling',
    initial_quantity: 2,
  },
  handling: {
    kind: 'portioning',
    handled_at: '2026-11-13T23:22:00Z',
    timezone: 'America/Sao_Paulo',
    handled_by_name: 'Ana',
    expiry_date: '2026-11-18',
    storage: 'refrigerated',
    position: 2,
    siblings: 4,
  },
};
const prepared: LabelData = {
  id: '42345678-1234-4234-8234-123456789abc',
  short_code: 'C-000123',
  balance: 6,
  kind: 'integral',
  storage: 'refrigerated',
  effective: {
    expiry_date: '2026-11-16',
    expiry_origin: 'receipt',
    initial_quantity: 6,
  },
  production: {
    produced_at: '2026-11-14T14:30:00Z',
    handled_by_name: 'Bruno Lima',
    timezone: 'America/Sao_Paulo',
    late: false,
    voided: null,
  },
  batch_receipts: {
    source_code: null,
    quantity: 6,
    unit: 'l',
    expiry_date: '2026-11-16',
    expiry_origin: 'responsible',
    products: { name: 'Caldo de legumes' },
  },
};

// Textos que o PDF desenha de fato (mesma leitura de pdf.test.ts), para comparar com a prévia.
async function drawn(data: LabelData): Promise<string[]> {
  const blob = await makeLabelPdf(data, ORIGIN);
  const raw = new TextDecoder('latin1').decode(await blob.arrayBuffer());
  return [...raw.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((m) =>
    m[1]!.replace(/\\([()\\])/g, '$1'),
  );
}
async function open(data: LabelData) {
  const user = userEvent.setup();
  render(<LabelPreview data={data} />);
  await user.click(
    screen.getByRole('button', { name: 'Ver prévia da etiqueta' }),
  );
  return {
    user,
    sheet: await screen.findByRole('group', { name: /^Etiqueta C-/ }),
  };
}

it('começa fechada e abre e fecha pelo botão, com o aviso de que o PDF não comprova impressão', async () => {
  const user = userEvent.setup();
  render(<LabelPreview data={receipt} />);
  expect(screen.queryByRole('group')).toBeNull();
  const button = screen.getByRole('button', { name: 'Ver prévia da etiqueta' });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  await user.click(button);
  expect(await screen.findByRole('group')).toBeVisible();
  expect(
    screen.getByText(/Baixar o PDF não comprova impressão nem aplicação/),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Fechar prévia' }));
  expect(screen.queryByRole('group')).toBeNull();
});

it.each([
  ['recebimento', receipt],
  ['produto fracionado', portion],
  ['preparação própria', prepared],
  ['preparação bloqueada', { ...prepared, hold: 'pending' as const }],
])(
  'a prévia de %s mostra só textos que o PDF desenha, nos mesmos termos',
  async (_name, data) => {
    const { sheet } = await open(data);
    const text = (await drawn(data)).join('\n');
    const [first = '', second = ''] = data.hold
      ? BLOCK_TEXT[data.hold].split(' - ')
      : [];
    const hold = data.hold ? `${first} ${second}` : null;
    const shown = [...sheet.querySelectorAll('p, strong, span, small')]
      .map((node) => node.textContent?.trim() ?? '')
      .filter(Boolean);
    expect(shown.length).toBeGreaterThan(4);
    for (const item of shown) {
      // A faixa de bloqueio sai do PDF em dois pedaços; o resto, linha a linha.
      const parts = item === hold ? [first, second] : [item];
      for (const part of parts) expect(text, part).toContain(part);
    }
  },
);

it('mostra o modelo, o nome, a validade em destaque e o QR com o mesmo endereço do PDF', async () => {
  const { sheet } = await open(prepared);
  const view = within(sheet);
  expect(view.getByText('PREPARAÇÃO PRÓPRIA')).toBeVisible();
  expect(view.getByText('Caldo de legumes')).toBeVisible();
  expect(view.getByText('VALIDADE')).toBeVisible();
  expect(view.getByText('16/11/2026')).toBeVisible();
  expect(view.getByText('Validade informada pelo responsável')).toBeVisible();
  expect(
    view.getByText('Produzido em: 14/11/2026 11:30 (America/Sao_Paulo)'),
  ).toBeVisible();
  expect(
    view.getByText('ID: 42345678-1234-4234-8234-123456789abc'),
  ).toBeVisible();
  expect(view.getByRole('img', { name: /QR do recipiente/ })).toHaveAttribute(
    'src',
    expect.stringMatching(/^data:image\/png/),
  );
});

it.each([
  ['manipulação anulada', { ...receipt, voided: true }, 'Manipulação anulada'],
  [
    'manipulação tardia sem liberação',
    { ...receipt, late_hold: true },
    'fora da janela de horário',
  ],
  [
    'nome com caractere sem suporte',
    {
      ...receipt,
      batch_receipts: {
        ...receipt.batch_receipts,
        products: { name: 'Arroz 🍚' },
      },
    },
    'caracteres não disponíveis',
  ],
])(
  'recusa a prévia de %s com a mesma mensagem do PDF',
  async (_name, data, message) => {
    const user = userEvent.setup();
    render(<LabelPreview data={data} />);
    await user.click(
      screen.getByRole('button', { name: 'Ver prévia da etiqueta' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('group')).toBeNull();
    await expect(makeLabelPdf(data, ORIGIN)).rejects.toThrow(message);
  },
);

it('com endereço não autorizado a prévia também recusa, como o PDF', async () => {
  setOfficialOrigin(null);
  const user = userEvent.setup();
  render(<LabelPreview data={receipt} />);
  await user.click(
    screen.getByRole('button', { name: 'Ver prévia da etiqueta' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Endereço não autorizado',
  );
});
