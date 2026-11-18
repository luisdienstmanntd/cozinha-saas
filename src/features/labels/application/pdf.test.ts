import { afterEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { makeLabelPdf, makeLabelsPdf } from './pdf';
import { isHostedLabels, labelOrigin, setOfficialOrigin } from './labelOrigin';
import { containerPath } from '../domain/label';
import type { LabelData } from '../domain/label';

const label: LabelData = {
  id: '12345678-1234-4234-8234-123456789abc',
  short_code: 'C-000001',
  balance: 1,
  batch_receipts: {
    source_code: '0001',
    quantity: 1.25,
    unit: 'kg',
    expiry_date: '2027-01-01',
    expiry_origin: 'original',
    products: { name: 'Arroz 🍚' },
  },
};
it('recusa caracteres sem suporte em vez de imprimir nome incompleto', async () => {
  await expect(makeLabelPdf(label, 'http://127.0.0.1:5173')).rejects.toThrow(
    'caracteres não disponíveis',
  );
});
it('recusa gerar QR para host fora da demonstração local', async () => {
  await expect(makeLabelPdf(label, 'https://externo.example')).rejects.toThrow(
    'Endereço não autorizado',
  );
});
it('recusa gerar PDF de recipiente cuja manipulação foi anulada (fatia 6.4)', async () => {
  await expect(
    makeLabelPdf(
      {
        ...label,
        voided: true,
        batch_receipts: {
          ...label.batch_receipts,
          products: { name: 'Arroz' },
        },
      },
      'http://127.0.0.1:5173',
    ),
  ).rejects.toThrow('Manipulação anulada');
});
it('recusa gerar PDF de derivado de manipulação tardia sem liberação (fatia 6.5a)', async () => {
  await expect(
    makeLabelPdf({ ...label, late_hold: true }, 'http://127.0.0.1:5173'),
  ).rejects.toThrow('fora da janela de horário');
});

// Fatia 7.1 recusava todo lote produzido; desde a 7.4 o modelo próprio existe e a recusa fica para lote
// produzido sem os dados da produção (falha fechada).
it('lote produzido sem os dados da produção é recusado (fatia 7.1, falha fechada desde a 7.4)', async () => {
  await expect(
    makeLabelPdf(
      {
        ...label,
        batch_receipts: {
          ...label.batch_receipts,
          source_code: null,
          expiry_origin: 'responsible',
          products: { name: 'Caldo de legumes' },
        },
      },
      'http://127.0.0.1:5173',
    ),
  ).rejects.toThrow('Dados da produção indisponíveis');
});

// Fatia 6.5b (desenho 7.2): etiqueta de recipiente bloqueado sai com a faixa; liberado, sai sem ela.
async function pdfText(data: LabelData) {
  const blob = await makeLabelPdf(data, 'http://127.0.0.1:5173');
  return new TextDecoder('latin1').decode(await blob.arrayBuffer());
}
const plain = {
  ...label,
  batch_receipts: { ...label.batch_receipts, products: { name: 'Frango' } },
};
it('imprime a faixa de bloqueio enquanto a ocorrência aguarda decisão ou foi rejeitada', async () => {
  const pending = await pdfText({ ...plain, hold: 'pending' });
  expect(pending).toContain('(BLOQUEADO)');
  expect(pending).toContain('(aguardando decisão)');
  const rejected = await pdfText({ ...plain, hold: 'rejected' });
  expect(rejected).toContain('(REJEITADO)');
  expect(rejected).toContain('(somente descarte)');
  const released = await pdfText({ ...plain, hold: null });
  expect(released).not.toContain('BLOQUEADO');
  expect(released).not.toContain('REJEITADO');
  expect(released).toContain('(Frango)');
});

// Fatia 6.7 (desenho 7.2): dois modelos. Cada campo obrigatório precisa estar no texto desenhado,
// sem depender do QR.
const derived: LabelData = {
  ...plain,
  id: '22345678-1234-4234-8234-123456789abc',
  short_code: 'C-000002',
  kind: 'derived',
  balance: 2,
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
  batch_receipts: {
    ...plain.batch_receipts,
    expiry_origin: 'original',
    suppliers: { name: 'Granja' },
  },
};
async function drawn(data: LabelData) {
  const text = await pdfText(data);
  return [...text.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)].map((m) =>
    m[1]!.replace(/\\([()\\])/g, '$1'),
  );
}
it('etiqueta de produto fracionado traz os campos obrigatórios legíveis sem o QR', async () => {
  const text = await drawn(derived);
  for (const item of [
    'PRODUTO FRACIONADO',
    'Frango',
    'Aberto em: 13/11/2026 20:22 (America/Sao_Paulo)',
    'VALIDADE APÓS ABERTURA',
    '18/11/2026',
    'definida por Ana em 13/11/2026',
    'Validade do fabricante: 01/01/2027',
    'Lote original: 0001',
    'Conservação: Refrigerado',
    'Manipulado por: Ana',
    'Porção 2 de 4',
    'Quantidade na criação: 2 kg',
    'C-000002',
  ])
    expect(text, item).toContain(item);
});
it('abertura inteira diz PRODUTO ABERTO e não imprime porção', async () => {
  const text = await pdfText({
    ...derived,
    handling: {
      ...derived.handling!,
      kind: 'opening',
      position: 1,
      siblings: 1,
    },
  });
  expect(text).toContain('(PRODUTO ABERTO)');
  expect(text).not.toContain('Porção');
});
it('validade do fabricante só aparece quando a do recebimento é original', async () => {
  const text = await pdfText({
    ...derived,
    batch_receipts: { ...derived.batch_receipts, expiry_origin: 'responsible' },
  });
  expect(text).not.toContain('Validade do fabricante');
});
it('derivado sem os dados da manipulação é recusado (falha fechada)', async () => {
  await expect(
    makeLabelPdf({ ...derived, handling: undefined }, 'http://127.0.0.1:5173'),
  ).rejects.toThrow('Dados da manipulação indisponíveis');
});
it('derivado bloqueado leva a faixa e continua cabendo na página', async () => {
  const text = await pdfText({ ...derived, hold: 'pending' });
  expect(text).toContain('(BLOQUEADO)');
  expect(text).toContain('(aguardando decisão)');
});
it('etiqueta de recebimento traz cabeçalho, fornecedor, conservação e entrada', async () => {
  const text = await drawn({
    ...plain,
    storage: 'ambient',
    batch_receipts: { ...plain.batch_receipts, suppliers: { name: 'Horta' } },
  });
  for (const item of [
    'RECEBIMENTO',
    'Fornecedor: Horta',
    'Conservação: Ambiente',
    'Quantidade inicial: 1,25 kg (entrada)',
    'Validade: 01/01/2027 (original)',
  ])
    expect(text, item).toContain(item);
});
it('PDF de várias etiquetas tem uma página por recipiente e recusa o arquivo todo se uma for recusada', async () => {
  const { makeLabelsPdf } = await import('./pdf');
  const blob = await makeLabelsPdf(
    [derived, { ...derived, id: '32345678-1234-4234-8234-123456789abc' }],
    'http://127.0.0.1:5173',
  );
  const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
  expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2);
  await expect(
    makeLabelsPdf(
      [derived, { ...derived, voided: true }],
      'http://127.0.0.1:5173',
    ),
  ).rejects.toThrow('Manipulação anulada');
  await expect(makeLabelsPdf([], 'http://127.0.0.1:5173')).rejects.toThrow(
    'Nenhuma etiqueta',
  );
});

// Fatia 7.4 (desenho da Fase 7, seção 5.2): modelo "Preparação própria".
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
const preparedPortion: LabelData = {
  ...prepared,
  id: '52345678-1234-4234-8234-123456789abc',
  short_code: 'C-000124',
  kind: 'derived',
  balance: 1,
  effective: {
    expiry_date: '2026-11-15',
    expiry_origin: 'handling',
    initial_quantity: 1,
  },
  handling: {
    kind: 'portioning',
    handled_at: '2026-11-14T15:00:00Z',
    timezone: 'America/Sao_Paulo',
    handled_by_name: 'Ana',
    expiry_date: '2026-11-15',
    storage: 'refrigerated',
    position: 2,
    siblings: 6,
  },
};
it('etiqueta de preparação própria traz os campos da seção 5.2, na ordem, legíveis sem o QR', async () => {
  const text = await drawn(prepared);
  const expected = [
    'PREPARAÇÃO PRÓPRIA',
    'Caldo de legumes',
    'VALIDADE',
    '16/11/2026',
    'Validade informada pelo responsável',
    'Produzido em: 14/11/2026 11:30 (America/Sao_Paulo)',
    'Produzido por: Bruno Lima',
    'Conservação: Refrigerado',
    'Quantidade produzida: 6 l',
    'C-000123',
  ];
  for (const item of expected) expect(text, item).toContain(item);
  const order = expected.map((item) => text.indexOf(item));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  // Sem lote do fabricante, fornecedor nem modelo de recebimento.
  for (const absent of ['RECEBIMENTO', 'Lote', 'Fornecedor', 'Porção'])
    expect(text.join(' ')).not.toContain(absent);
});
it('o nome da preparação é o maior texto da etiqueta', async () => {
  const blob = await makeLabelPdf(prepared, 'http://127.0.0.1:5173');
  const raw = new TextDecoder('latin1').decode(await blob.arrayBuffer());
  const sizes = [
    ...raw.matchAll(/\/F\d+ ([\d.]+) Tf[^]*?\(((?:[^()\\]|\\.)*)\)\s*Tj/g),
  ].map((m) => ({ size: Number(m[1]), text: m[2]! }));
  const name = sizes.find((item) => item.text === 'Caldo de legumes')!;
  expect(name).toBeDefined();
  for (const item of sizes) expect(item.size).toBeLessThanOrEqual(name.size);
});
it('porção de preparação usa o mesmo modelo, com a quantidade e "porção X de N"', async () => {
  const text = await drawn(preparedPortion);
  for (const item of [
    'PREPARAÇÃO PRÓPRIA',
    '15/11/2026',
    'Produzido em: 14/11/2026 11:30 (America/Sao_Paulo)',
    'Produzido por: Bruno Lima',
    'Quantidade da porção: 1 l',
    'Porção 2 de 6',
    'C-000124',
  ])
    expect(text, item).toContain(item);
  expect(text.join(' ')).not.toContain('PRODUTO FRACIONADO');
});
it('recusa preparação anulada, tardia sem liberação ou sem conservação, e o arquivo inteiro', async () => {
  const origin = 'http://127.0.0.1:5173';
  await expect(
    makeLabelPdf(
      {
        ...prepared,
        production: {
          ...prepared.production!,
          voided: { reason: 'erro', created_at: '2026-11-14T15:00:00Z' },
        },
      },
      origin,
    ),
  ).rejects.toThrow('Produção anulada');
  await expect(
    makeLabelPdf({ ...prepared, production_hold: true }, origin),
  ).rejects.toThrow('Produção registrada fora da janela');
  await expect(
    makeLabelPdf({ ...prepared, storage: null }, origin),
  ).rejects.toThrow('Dados da produção indisponíveis');
  const { makeLabelsPdf } = await import('./pdf');
  await expect(
    makeLabelsPdf(
      [preparedPortion, { ...preparedPortion, production_hold: true }],
      origin,
    ),
  ).rejects.toThrow('Produção registrada fora da janela');
  const blob = await makeLabelsPdf([prepared, preparedPortion], origin);
  const raw = new TextDecoder('latin1').decode(await blob.arrayBuffer());
  expect(raw.match(/\/Type \/Page\b/g)).toHaveLength(2);
});
it('preparação bloqueada liberável leva a faixa e cabe na página', async () => {
  const text = await pdfText({ ...prepared, hold: 'pending' });
  expect(text).toContain('(BLOQUEADO)');
});

// V5B (D-064): quantidades decimais nas etiquetas saem com vírgula, sem separador de milhar e sem casas
// sobrando; o QR continua levando só a URL e o ID; nome longo continua cabendo em uma página.
const LONG_NAME = 'Açúcar integral de cozinha '.repeat(4).trim(); // 107 caracteres: cabe só no recebimento
const LONG_FIT = 'Açúcar integral de cozinha '.repeat(3).trim(); // 80 caracteres: cabe na preparação
const MID_NAME = 'Açúcar integral de cozinha '.repeat(2).trim(); // 53 caracteres: cabe no fracionado
const pages = (text: string) =>
  (text.match(/\/Type \/Page\b(?!s)/g) ?? []).length;
const dotNumber = /\d\.\d+ (?:kg|l|un)\b/;

it('V5B: etiqueta de recebimento mostra a entrada decimal com vírgula e cabe em uma página com nome longo', async () => {
  const data: LabelData = {
    ...plain,
    storage: 'ambient',
    balance: 12.5,
    batch_receipts: {
      ...plain.batch_receipts,
      quantity: 12.5,
      products: { name: LONG_NAME },
      suppliers: { name: 'Horta' },
    },
  };
  const text = await drawn(data);
  expect(text).toContain('Quantidade inicial: 12,5 kg (entrada)');
  expect(text.some((line) => dotNumber.test(line))).toBe(false);
  expect(pages(await pdfText(data))).toBe(1);
});
it.each([
  [1.25, '1,25'],
  [0.001, '0,001'],
  [3, '3'],
  [1500, '1500'],
  [999999999.999, '999999999,999'],
])(
  'V5B: etiqueta de preparação com %s mostra %s, nome longo e uma página',
  async (quantity, shown) => {
    const data: LabelData = {
      ...prepared,
      effective: { ...prepared.effective!, initial_quantity: quantity },
      batch_receipts: {
        ...prepared.batch_receipts,
        quantity,
        products: { name: LONG_FIT },
      },
    };
    const text = await drawn(data);
    // O modelo quebra a linha quando o texto é largo (999999999,999); o conteúdo continua inteiro.
    expect(text.join(' ')).toContain(`Quantidade produzida: ${shown} l`);
    expect(text.some((line) => dotNumber.test(line))).toBe(false);
    expect(text.join(' ')).not.toMatch(/\d\.\d{3}\b/);
    expect(pages(await pdfText(data))).toBe(1);
  },
);
it('V5B: etiquetas de porção e de produto fracionado mostram a quantidade com vírgula', async () => {
  const portion = await drawn({
    ...preparedPortion,
    effective: { ...preparedPortion.effective!, initial_quantity: 0.75 },
  });
  expect(portion).toContain('Quantidade da porção: 0,75 l');
  const split = await drawn({
    ...derived,
    effective: { ...derived.effective!, initial_quantity: 2.5 },
    batch_receipts: {
      ...derived.batch_receipts,
      products: { name: MID_NAME },
    },
  });
  expect(split).toContain('Quantidade na criação: 2,5 kg');
  expect(split.some((line) => dotNumber.test(line))).toBe(false);
});
it('V5B: o QR continua levando só a URL e o ID do recipiente, qualquer que seja a quantidade', async () => {
  const spy = vi.spyOn(QRCode, 'toDataURL');
  try {
    const origin = 'http://127.0.0.1:5173';
    await makeLabelPdf(plain, origin);
    await makeLabelPdf(
      {
        ...plain,
        balance: 12.5,
        batch_receipts: { ...plain.batch_receipts, quantity: 12.5 },
      },
      origin,
    );
    const texts = spy.mock.calls.map((call) => String(call[0]));
    expect(texts).toEqual([
      `${origin}${containerPath(plain.id)}`,
      `${origin}${containerPath(plain.id)}`,
    ]);
  } finally {
    spy.mockRestore();
  }
});
it('V5B: nome longo demais para o modelo continua recusado em vez de impresso cortado', async () => {
  await expect(
    makeLabelPdf(
      {
        ...prepared,
        batch_receipts: {
          ...prepared.batch_receipts,
          products: { name: LONG_NAME },
        },
      },
      'http://127.0.0.1:5173',
    ),
  ).rejects.toThrow('Conteúdo não cabe neste modelo de etiqueta.');
});

// Fatia 8.4b: ambiente hospedado. O QR leva o endereço oficial configurado; qualquer outro host
// continua recusado. Os três modelos (recebimento, derivado, preparação) e o arquivo com várias
// páginas funcionam com o endereço oficial.
describe('endereço oficial hospedado (fatia 8.4b)', () => {
  const official = 'https://cozzigo.pages.dev';
  afterEach(() => setOfficialOrigin(null));

  it('sem endereço oficial configurado, o host hospedado é recusado', async () => {
    await expect(makeLabelPdf(plain, official)).rejects.toThrow(
      'Endereço não autorizado',
    );
  });
  it.each([
    ['recebimento', plain],
    ['derivado', derived],
    ['preparação', prepared],
    ['porção da preparação', preparedPortion],
  ])(
    'gera a etiqueta de %s com QR do endereço oficial',
    async (_name, data) => {
      setOfficialOrigin(official);
      const spy = vi.spyOn(QRCode, 'toDataURL');
      try {
        const blob = await makeLabelPdf(data, labelOrigin());
        expect(blob.size).toBeGreaterThan(1000);
        expect(spy.mock.calls.map((call) => String(call[0]))).toEqual([
          `${official}${containerPath(data.id)}`,
        ]);
      } finally {
        spy.mockRestore();
      }
    },
  );
  it('várias etiquetas no mesmo arquivo usam o endereço oficial', async () => {
    setOfficialOrigin(official);
    const blob = await makeLabelsPdf([plain, derived, prepared], official);
    const raw = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    expect(raw.match(/\/Type \/Page\b/g)).toHaveLength(3);
  });
  it.each([
    'https://externo.example',
    'https://cozzigo.pages.dev.externo.example',
    'http://cozzigo.pages.dev',
    'https://cozzigo.pages.dev:8443',
    'https://preview.cozzigo.pages.dev',
    'http://127.0.0.1:9999',
  ])('recusa %s mesmo com o endereço oficial configurado', async (origin) => {
    setOfficialOrigin(official);
    await expect(makeLabelPdf(plain, origin)).rejects.toThrow(
      'Endereço não autorizado',
    );
  });
  it('endereço oficial inválido não é guardado', async () => {
    setOfficialOrigin('https://localhost');
    expect(isHostedLabels()).toBe(false);
    await expect(makeLabelPdf(plain, 'https://localhost')).rejects.toThrow(
      'Endereço não autorizado',
    );
  });
  it('o ambiente local continua usando o endereço local', async () => {
    expect(isHostedLabels()).toBe(false);
    await expect(
      makeLabelPdf(plain, 'http://127.0.0.1:5174'),
    ).resolves.toBeInstanceOf(Blob);
  });
  it('as recusas de regra de negócio continuam valendo no ambiente hospedado', async () => {
    setOfficialOrigin(official);
    await expect(
      makeLabelPdf({ ...plain, voided: true }, official),
    ).rejects.toThrow('Manipulação anulada');
    await expect(
      makeLabelPdf({ ...plain, late_hold: true }, official),
    ).rejects.toThrow('fora da janela de horário');
  });
});
