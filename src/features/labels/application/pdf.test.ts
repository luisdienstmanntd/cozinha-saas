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
