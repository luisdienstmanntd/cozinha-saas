import { expect, it } from 'vitest';
import { makeLabelPdf } from './pdf';
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
    'Endereço de demonstração indisponível',
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
    'Quantidade inicial: 1.25 kg (entrada)',
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
