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
