import { describe, expect, it } from 'vitest';
import {
  formatCivilDate,
  formatDateTime,
  timezoneLabel,
  timezoneName,
} from './dates';

describe('datas no formato brasileiro (V3)', () => {
  it('converte data civil sem deslocar o dia', () => {
    expect(formatCivilDate('2026-11-16')).toBe('16/11/2026');
    expect(formatCivilDate('2030-01-01')).toBe('01/01/2030');
    expect(formatCivilDate('texto')).toBe('texto');
  });

  it('mostra o instante no fuso da unidade, com 24 horas', () => {
    const at = '2026-11-14T23:00:31.357489+00:00';
    expect(formatDateTime(at, 'America/Sao_Paulo')).toBe('14/11/2026 20:00');
    expect(formatDateTime(at, 'UTC')).toBe('14/11/2026 23:00');
    // Virada de dia: o mesmo instante já é dia 15 em Tóquio.
    expect(formatDateTime(at, 'Asia/Tokyo')).toBe('15/11/2026 08:00');
    expect(formatDateTime(new Date('2026-01-01T03:05:00Z'), 'UTC')).toBe(
      '01/01/2026 03:05',
    );
  });

  it('não esconde valor inválido', () => {
    expect(formatDateTime('não é data', 'UTC')).toBe('não é data');
    expect(formatDateTime('2026-01-01T00:00:00Z', 'Inválido/Fuso')).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });

  it('dá nome legível ao fuso e mantém o identificador', () => {
    expect(timezoneLabel('America/Sao_Paulo')).toMatch(
      /^Horário .+ \(America\/Sao_Paulo\)$/,
    );
    expect(timezoneLabel('Inválido/Fuso')).toBe('Inválido/Fuso');
  });

  it('dá só o nome legível do fuso para as telas de escolha (D-075)', () => {
    expect(timezoneName('America/Sao_Paulo')).toMatch(/^Horário /);
    expect(timezoneName('America/Sao_Paulo')).not.toContain('America/');
    expect(timezoneName('Inválido/Fuso')).toBe('Inválido/Fuso');
  });
});
