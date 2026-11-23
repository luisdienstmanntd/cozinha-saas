import { describe, expect, it } from 'vitest';
import { containerRow } from '../../../test/fakeContainers';
import {
  MAX_CONTAINER_ID,
  expiryFilterStart,
  inExpiryFilter,
  parseExpiryFilter,
  shiftCivilDate,
  trimToExpiryFilter,
} from './expiryFilter';

describe('parseExpiryFilter', () => {
  it('aceita só as quatro categorias', () => {
    expect(parseExpiryFilter('vencidos')).toBe('vencidos');
    expect(parseExpiryFilter('hoje')).toBe('hoje');
    expect(parseExpiryFilter('amanha')).toBe('amanha');
    expect(parseExpiryFilter('posteriores')).toBe('posteriores');
    for (const value of [null, '', 'Vencidos', 'amanhã', 'todos', ' hoje'])
      expect(parseExpiryFilter(value)).toBeNull();
  });
});

describe('shiftCivilDate', () => {
  it('atravessa mês, ano e 29 de fevereiro', () => {
    expect(shiftCivilDate('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftCivilDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftCivilDate('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftCivilDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftCivilDate('2028-03-01', -1)).toBe('2028-02-29');
    expect(shiftCivilDate('2027-02-28', 1)).toBe('2027-03-01');
  });
  it('recusa data inválida em vez de deslocar', () => {
    for (const value of ['2026-02-30', '2026-13-01', '22/11/2026', ''])
      expect(() => shiftCivilDate(value, 1)).toThrow('Data civil inválida.');
  });
});

describe('expiryFilterStart', () => {
  it('começa no primeiro recipiente de cada categoria', () => {
    expect(expiryFilterStart('vencidos', '2026-12-31')).toBeNull();
    expect(expiryFilterStart('hoje', '2026-12-31')).toEqual({
      expiryDate: '2026-12-30',
      id: MAX_CONTAINER_ID,
    });
    expect(expiryFilterStart('amanha', '2026-12-31')).toEqual({
      expiryDate: '2026-12-31',
      id: MAX_CONTAINER_ID,
    });
    expect(expiryFilterStart('posteriores', '2026-12-31')).toEqual({
      expiryDate: '2027-01-01',
      id: MAX_CONTAINER_ID,
    });
  });
});

describe('inExpiryFilter', () => {
  const reference = '2026-02-28';
  it('usa as mesmas fronteiras das contagens', () => {
    const cases: [string, string[]][] = [
      ['2026-02-27', ['vencidos']],
      ['2026-02-28', ['hoje']],
      ['2026-03-01', ['amanha']],
      ['2026-03-02', ['posteriores']],
    ];
    for (const [date, expected] of cases)
      for (const filter of [
        'vencidos',
        'hoje',
        'amanha',
        'posteriores',
      ] as const)
        expect(inExpiryFilter(filter, reference, date)).toBe(
          expected.includes(filter),
        );
  });
});

describe('trimToExpiryFilter', () => {
  const at = (expiry_date: string) => containerRow({ expiry_date });
  const cursor = { expiryDate: '2026-03-01', id: MAX_CONTAINER_ID };
  it('mantém a página seguinte enquanto a categoria não acabou', () => {
    const page = { rows: [at('2026-02-28'), at('2026-02-28')], next: cursor };
    expect(trimToExpiryFilter('hoje', '2026-02-28', page)).toEqual(page);
  });
  it('corta no fim da categoria e encerra a paginação', () => {
    const today = at('2026-02-28');
    const page = { rows: [today, at('2026-03-01')], next: cursor };
    expect(trimToExpiryFilter('hoje', '2026-02-28', page)).toEqual({
      rows: [today],
      next: null,
    });
  });
  it('categoria vazia fica sem linhas e sem página seguinte', () => {
    const page = { rows: [at('2026-03-05')], next: cursor };
    expect(trimToExpiryFilter('vencidos', '2026-02-28', page)).toEqual({
      rows: [],
      next: null,
    });
  });
});
