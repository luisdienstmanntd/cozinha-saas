import { describe, expect, it } from 'vitest';
import { getExpiryStatus, localCivilDate } from './expiryStatus';

describe('painel de validade', () => {
  it('classifica datas civis sem deslocamento UTC', () => {
    const now = new Date('2026-11-08T02:30:00.000Z');
    expect(localCivilDate(now, 'America/Sao_Paulo')).toBe('2026-11-07');
    expect(getExpiryStatus('2026-11-06', 'America/Sao_Paulo', now)).toBe(
      'overdue',
    );
    expect(getExpiryStatus('2026-11-07', 'America/Sao_Paulo', now)).toBe(
      'today',
    );
    expect(getExpiryStatus('2026-11-08', 'America/Sao_Paulo', now)).toBe(
      'tomorrow',
    );
    expect(getExpiryStatus('2026-11-09', 'America/Sao_Paulo', now)).toBe(
      'upcoming',
    );
  });

  it('usa o fuso selecionado para a virada de dia', () => {
    const now = new Date('2026-11-08T02:30:00.000Z');
    expect(localCivilDate(now, 'UTC')).toBe('2026-11-08');
    expect(getExpiryStatus('2026-11-08', 'UTC', now)).toBe('today');
    expect(getExpiryStatus('2026-11-09', 'UTC', now)).toBe('tomorrow');
  });

  it('respeita dias de calendário em uma mudança de horário sazonal', () => {
    const now = new Date('2026-03-08T06:30:00.000Z');
    expect(localCivilDate(now, 'America/New_York')).toBe('2026-03-08');
    expect(getExpiryStatus('2026-03-09', 'America/New_York', now)).toBe(
      'tomorrow',
    );
  });
});
