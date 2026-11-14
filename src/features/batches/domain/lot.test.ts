import { expect, it } from 'vitest';
import { PRODUCED_LOT, lotText } from './lot';

it('mostra o lote do fabricante no recebimento', () => {
  expect(lotText('L-0001')).toBe('lote L-0001');
  expect(lotText('L-0001', true)).toBe('Lote L-0001');
});
it('lote produzido aparece como preparação própria, sem código inventado (fatia 7.1)', () => {
  expect(lotText(null)).toBe(PRODUCED_LOT);
  expect(lotText(null, true)).toBe('Preparação própria');
});
