import { describe, expect, it } from 'vitest';
import { batchInputSchema } from './batch';

const valid = {
  productId: '10000000-0000-4000-8000-000000000001',
  supplierId: '10000000-0000-4000-8000-000000000002',
  intentId: '10000000-0000-4000-8000-000000000003',
  sourceCode: '0001',
  quantity: '1.250',
  expiryDate: '2027-01-01',
  expiryOrigin: 'original',
  originalExpiryDate: '2027-01-01',
};
describe('dados de recebimento', () => {
  it('aceita data civil e quantidade explícita', () => {
    expect(batchInputSchema.parse(valid).sourceCode).toBe('0001');
  });
  it.each(['0', '-1', '1.2345', 'NaN', '1000000001'])(
    'recusa quantidade inválida %s',
    (quantity) => {
      expect(batchInputSchema.safeParse({ ...valid, quantity }).success).toBe(
        false,
      );
    },
  );
  it('não confunde validade original e definida pelo responsável', () => {
    expect(
      batchInputSchema.safeParse({
        ...valid,
        expiryDate: '2027-02-01',
        expiryOrigin: 'responsible',
      }).success,
    ).toBe(false);
    expect(
      batchInputSchema.safeParse({
        ...valid,
        expiryOrigin: 'responsible',
        originalExpiryDate: null,
      }).success,
    ).toBe(true);
    expect(
      batchInputSchema.safeParse({ ...valid, expiryDate: '2027-02-30' })
        .success,
    ).toBe(false);
  });
});
