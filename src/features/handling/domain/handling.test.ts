import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import {
  handlingInputSchema,
  instantToZoned,
  isLate,
  isQuantity,
  splitEqually,
  totals,
  voidInputSchema,
  zonedToInstant,
} from './handling';
import { HANDLING_MESSAGES, knownMessage } from './messages';

const id = '12345678-1234-4234-8234-123456789abc';
const base = {
  sourceContainerId: id,
  kind: 'portioning' as const,
  quantities: ['1', '1.5'],
  expiryDate: '2026-12-01',
  storage: 'refrigerated' as const,
  handledAt: '2026-11-13T12:00:00.000Z',
  handledBy: id,
  remainder: 'none' as const,
  remainderReason: null,
  note: null,
  lateReason: null,
  intentId: id,
};

describe('quantidades', () => {
  it('aceita até 3 decimais com ponto e recusa o resto', () => {
    for (const ok of ['1', '0.5', '12.125']) expect(isQuantity(ok)).toBe(true);
    for (const bad of ['', '0', '-1', '1,5', '1.2345', 'abc', '01'])
      expect(isQuantity(bad)).toBe(false);
  });
  it('soma sem erro de ponto flutuante e mostra a sobra', () => {
    expect(totals(['0.1', '0.2'], 1)).toEqual({
      sumMilli: 300,
      restMilli: 700,
    });
    expect(totals(['2', '2'], 3).restMilli).toBe(-1000);
  });
  it('divide igualmente; a última porção absorve a diferença', () => {
    expect(splitEqually(1, 3, false)).toEqual(['0.333', '0.333', '0.334']);
    expect(splitEqually(10, 3, true)).toEqual(['3', '3', '4']);
    expect(splitEqually(2, 2, false)).toEqual(['1', '1']);
  });
});

describe('horário no fuso da unidade', () => {
  it('converte ida e volta', () => {
    const instant = zonedToInstant('2026-11-13T09:30', 'America/Sao_Paulo');
    expect(instant).toBe('2026-11-13T12:30:00.000Z');
    expect(instantToZoned(new Date(instant!), 'America/Sao_Paulo')).toBe(
      '2026-11-13T09:30',
    );
  });
  it('recusa data inexistente ou formato errado', () => {
    expect(zonedToInstant('2026-02-31T10:00', 'America/Sao_Paulo')).toBeNull();
    expect(zonedToInstant('13/11/2026 10:00', 'America/Sao_Paulo')).toBeNull();
  });
  it('janela de 2 horas', () => {
    const now = new Date('2026-11-13T12:00:00Z');
    expect(isLate('2026-11-13T10:00:00Z', now)).toBe(false);
    expect(isLate('2026-11-13T09:59:00Z', now)).toBe(true);
  });
});

describe('esquema da manipulação', () => {
  it('aceita porcionar e abrir', () => {
    expect(handlingInputSchema.safeParse(base).success).toBe(true);
    expect(
      handlingInputSchema.safeParse({
        ...base,
        kind: 'opening',
        quantities: ['1'],
      }).success,
    ).toBe(true);
  });
  it('recusa combinações incoerentes', () => {
    const bad = (patch: object) =>
      handlingInputSchema.safeParse({ ...base, ...patch }).success;
    expect(bad({ kind: 'opening' })).toBe(false);
    expect(bad({ quantities: ['1'] })).toBe(false);
    expect(bad({ remainder: 'discard' })).toBe(false);
    expect(bad({ remainderReason: 'x' })).toBe(false);
    expect(
      bad({ kind: 'opening', quantities: ['1'], remainder: 'portion' }),
    ).toBe(false);
    expect(bad({ handledAt: '2026-11-13T12:00:00' })).toBe(false);
  });
  it('anulação exige motivo', () => {
    expect(
      voidInputSchema.safeParse({ handlingId: id, reason: '', intentId: id })
        .success,
    ).toBe(false);
    expect(
      voidInputSchema.safeParse({
        handlingId: id,
        reason: 'Erro',
        intentId: id,
      }).success,
    ).toBe(true);
  });
});

describe('mensagens do banco', () => {
  it('repete só mensagens conhecidas', () => {
    expect(knownMessage(HANDLING_MESSAGES[0])).toBe(HANDLING_MESSAGES[0]);
    expect(knownMessage('select * from secrets')).toBeNull();
    expect(knownMessage(undefined)).toBeNull();
  });
  it('cada mensagem existe nas migrações', () => {
    const dir = 'supabase/migrations';
    const sql = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(`${dir}/${file}`, 'utf8'))
      .join('\n');
    for (const message of HANDLING_MESSAGES)
      expect(sql.includes(message), message).toBe(true);
  });
});
