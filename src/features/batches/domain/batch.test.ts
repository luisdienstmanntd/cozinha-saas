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
  storageCondition: 'ambient',
  temperatureStatus: 'not_required',
  receivedTemperatureC: null,
  temperatureReason: null,
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
  // Fatia 6.5b: as mesmas combinações que o banco aceita (D-041); o banco continua sendo a barreira.
  it.each([
    ['refrigerated', 'measured', '4', null],
    ['frozen', 'measured', '-18.5', null],
    ['refrigerated', 'not_measured', null, 'Termômetro sem pilha'],
    ['ambient', 'measured', '22', null],
    ['ambient', 'not_required', null, null],
  ])('aceita %s / %s', (storage, status, temperature, reason) => {
    expect(
      batchInputSchema.safeParse({
        ...valid,
        storageCondition: storage,
        temperatureStatus: status,
        receivedTemperatureC: temperature,
        temperatureReason: reason,
      }).success,
    ).toBe(true);
  });
  it.each([
    ['refrigerated', 'not_required', null, null],
    ['ambient', 'not_measured', null, 'Sem termômetro'],
    ['refrigerated', 'measured', null, null],
    ['refrigerated', 'measured', '4', 'motivo'],
    ['refrigerated', 'not_measured', null, null],
    ['refrigerated', 'not_measured', null, '   '],
    ['refrigerated', 'not_measured', '4', 'motivo'],
    ['refrigerated', 'measured', '4.25', null],
    ['refrigerated', 'measured', '81', null],
    ['frozen', 'measured', '-50.1', null],
    ['frozen', 'measured', 'NaN', null],
    ['refrigerated', 'measured', '4', 'x'.repeat(301)],
    ['vacuum', 'measured', '4', null],
  ])('recusa %s / %s / %s / %s', (storage, status, temperature, reason) => {
    expect(
      batchInputSchema.safeParse({
        ...valid,
        storageCondition: storage,
        temperatureStatus: status,
        receivedTemperatureC: temperature,
        temperatureReason: reason,
      }).success,
    ).toBe(false);
  });
});
