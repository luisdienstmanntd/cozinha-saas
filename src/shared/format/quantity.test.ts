import { describe, expect, it } from 'vitest';
import { toDotTemperature } from './temperature';
import { batchInputSchema } from '../../features/batches/domain/batch';
import { isQuantity } from '../../features/handling/domain/handling';
import { temperatureInputSchema } from '../../features/production/domain/production';
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

// V5B (D-064): exibição. Só as casas necessárias, até 3, vírgula, sem separador de milhar, sem arredondar o
// que está guardado.
describe('formatQuantity (V5B)', () => {
  it.each([
    [0, '0'],
    [1, '1'],
    [12.5, '12,5'],
    [0.5, '0,5'],
    [1.25, '1,25'],
    [0.001, '0,001'],
    [0.333, '0,333'],
    [1500, '1500'],
    [1000000, '1000000'],
    [1500.5, '1500,5'],
    [999999999.999, '999999999,999'],
    [1000000000, '1000000000'],
    ['12.500', '12,5'],
    ['3.000', '3'],
    ['1.250', '1,25'],
    ['0.10', '0,1'],
    ['7', '7'],
    [' 2.5 ', '2,5'],
  ])('%s vira %s', (value, shown) => {
    expect(formatQuantity(value)).toBe(shown);
  });
  it('não usa separador de milhar nem espaço especial, qualquer que seja o valor', () => {
    for (const value of [1500, 1234567.891, 999999999.999])
      expect(formatQuantity(value)).toMatch(/^\d+(?:,\d{1,3})?$/);
  });
  it('resíduo de ponto flutuante além de 3 casas é arredondado para 3 (toFixed, não truncamento); o que o banco guarda não é tocado', () => {
    expect(formatQuantity(0.1 + 0.2)).toBe('0,3');
    expect(formatQuantity(1.25 - 0.5)).toBe('0,75');
    expect(formatQuantity(11.75 - 0.75)).toBe('11');
    expect(formatQuantity(1e-7)).toBe('0');
    expect(formatQuantity(1.5e3)).toBe('1500');
  });
  it('ida e volta: o que se mostra, digitado de novo, vira o mesmo número guardado', () => {
    for (const stored of [
      0.001, 0.25, 1.25, 12.5, 333.333, 1500, 999999999.999,
    ]) {
      const parsed = parseQuantity(formatQuantity(stored));
      expect(parsed.ok).toBe(true);
      expect(parsed.ok && Number(parsed.value)).toBe(stored);
    }
  });
  it('texto que não é número volta como veio', () => {
    expect(formatQuantity('')).toBe('');
    expect(formatQuantity('abc')).toBe('abc');
  });
});

describe('toDotTemperature (V5B)', () => {
  it.each([
    ['-18,5', '-18.5'],
    ['-18.5', '-18.5'],
    ['4,0', '4.0'],
    ['80', '80'],
    ['  4,5 ', '4.5'],
    ['0,5', '0.5'],
  ])('%s vira %s', (typed, dot) => {
    expect(toDotTemperature(typed)).toBe(dot);
  });
  it.each(['1,2,3', '1.5,2', '1,5.2', '4,,5', ''])(
    'não inventa leitura para %s: segue como digitado e o esquema recusa',
    (typed) => {
      expect(toDotTemperature(typed)).toBe(typed.trim());
    },
  );
  it('as validações do esquema continuam as mesmas depois da conversão', () => {
    const base = {
      batchId: '10000000-0000-4000-8000-000000000001',
      moment: 'cooling_end' as const,
      measuredAt: '2026-11-14T15:00:00.000Z',
    };
    const ok = (typed: string) =>
      temperatureInputSchema.safeParse({
        ...base,
        temperature: toDotTemperature(typed),
      }).success;
    for (const typed of ['-50', '-50,0', '80', '80,0', '-18,5', '4,5', '0'])
      expect(ok(typed), typed).toBe(true);
    for (const typed of [
      '80,1',
      '-50,1',
      '81',
      '4,55',
      '1,000',
      '1.000,5',
      '4,5,5',
      ',5',
      '4,',
      'abc',
      '',
    ])
      expect(ok(typed), typed).toBe(false);
  });
});
