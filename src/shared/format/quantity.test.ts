import { describe, expect, it } from 'vitest';
import { batchInputSchema } from '../../features/batches/domain/batch';
import { isQuantity } from '../../features/handling/domain/handling';
import {
  formatQuantity,
  parseQuantity,
  quantityProblemText,
  toDotQuantity,
} from './quantity';

// V5 (M5, D-063): vírgula e ponto decimal nas quantidades, com regra explícita para ambiguidades.
describe('parseQuantity', () => {
  it.each([
    ['2,5', '2.5'],
    ['0,5', '0.5'],
    ['0,250', '0.250'],
    ['1,500', '1.500'],
    ['12,125', '12.125'],
    ['1500', '1500'],
    ['1500,5', '1500.5'],
    ['2.5', '2.5'],
    ['1.25', '1.25'],
    ['0.250', '0.250'],
    ['  3,75  ', '3.75'],
    ['7', '7'],
  ])('aceita %s como %s', (typed, value) => {
    expect(parseQuantity(typed)).toEqual({ ok: true, value });
  });

  it.each([
    ['1.000,50', 'grouping'],
    ['1,000.50', 'grouping'],
    ['1.000.000', 'grouping'],
    ['1,000,000', 'grouping'],
    ['2,,5', 'grouping'],
    ['1.500', 'ambiguous'],
    ['2.000', 'ambiguous'],
    ['12.125', 'ambiguous'],
    ['', 'empty'],
    ['   ', 'empty'],
    ['1 500', 'format'],
    ['-1', 'format'],
    ['+1', 'format'],
    [',5', 'format'],
    ['.5', 'format'],
    ['2,', 'format'],
    ['2.', 'format'],
    ['1e3', 'format'],
    ['abc', 'format'],
    ['NaN', 'format'],
    ['２,５', 'format'],
  ])('recusa %s (%s)', (typed, problem) => {
    expect(parseQuantity(typed)).toEqual({ ok: false, problem });
  });

  it('vírgula com três casas é sempre decimal; ponto com três casas só quando a parte inteira é zero', () => {
    expect(parseQuantity('1,000')).toEqual({ ok: true, value: '1.000' });
    expect(parseQuantity('0.500')).toEqual({ ok: true, value: '0.500' });
    expect(parseQuantity('00.500')).toEqual({ ok: true, value: '00.500' });
    expect(parseQuantity('1.000')).toEqual({ ok: false, problem: 'ambiguous' });
  });
});

// A tela converte com toDotQuantity e entrega a forma com ponto aos esquemas de sempre, que não mudaram.
const throughSchema = (typed: string) => {
  const dot = toDotQuantity(typed);
  return dot !== null && isQuantity(dot) ? dot : null;
};
describe('conversão seguida da validação de sempre', () => {
  it('converte para a forma com ponto que o banco recebe', () => {
    expect(throughSchema('2,5')).toBe('2.5');
    expect(throughSchema('1,250')).toBe('1.250');
    expect(throughSchema('0.75')).toBe('0.75');
    expect(throughSchema('1000000000')).toBe('1000000000');
    expect(throughSchema('999999999,999')).toBe('999999999.999');
  });
  it.each([
    '0',
    '0,0',
    '0,000',
    '01',
    '01,5',
    '1,2345',
    '1.2345',
    '1000000000,001',
    '1000000001',
    '12345678901',
    '1.500',
    '1.000,50',
    '1,000.50',
    '',
  ])('mantém a recusa de %s', (typed) => {
    expect(throughSchema(typed)).toBeNull();
  });
  it('a forma com ponto passa de novo pelo esquema (a camada de dados repete o parse)', () => {
    const dot = toDotQuantity('1,250')!;
    const input = {
      productId: '10000000-0000-4000-8000-000000000001',
      supplierId: '10000000-0000-4000-8000-000000000002',
      intentId: '10000000-0000-4000-8000-000000000003',
      sourceCode: '0001',
      quantity: dot,
      expiryDate: '2027-01-01',
      expiryOrigin: 'original',
      originalExpiryDate: '2027-01-01',
      storageCondition: 'ambient',
      temperatureStatus: 'not_required',
      receivedTemperatureC: null,
      temperatureReason: null,
    };
    const once = batchInputSchema.parse(input);
    expect(batchInputSchema.parse(once).quantity).toBe('1.250');
  });
});

describe('textos', () => {
  it('mostra com vírgula, sem separador de milhar', () => {
    expect(formatQuantity('2.5')).toBe('2,5');
    expect(formatQuantity(1500)).toBe('1500');
    expect(formatQuantity(0.333)).toBe('0,333');
  });
  it('toDotQuantity devolve nulo quando a regra recusa', () => {
    expect(toDotQuantity('2,5')).toBe('2.5');
    expect(toDotQuantity('1.500')).toBeNull();
    expect(toDotQuantity('1.000,50')).toBeNull();
  });
  it('explica as recusas da regra nova e deixa as demais para a mensagem da tela', () => {
    expect(quantityProblemText('1.000,50')).toMatch(
      /não use separador de milhar/,
    );
    expect(quantityProblemText('1.500')).toMatch(
      /^Quantidade ambígua: "1\.500" pode ser milhar ou decimal\./,
    );
    expect(quantityProblemText('abc')).toBeNull();
    expect(quantityProblemText('2,5')).toBeNull();
  });
});
