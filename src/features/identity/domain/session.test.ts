import { describe, expect, it } from 'vitest';
import {
  INACTIVITY_LIMIT_MS,
  TOUCH_INTERVAL_MS,
  isIdle,
  parseActivity,
  shouldTouch,
} from './session';

describe('regras da sessão (V2, D-025)', () => {
  it('expira com exatamente 30 minutos sem atividade, não antes', () => {
    const now = 1_800_000_000_000;
    expect(isIdle(now - INACTIVITY_LIMIT_MS + 1, now)).toBe(false);
    expect(isIdle(now - INACTIVITY_LIMIT_MS, now)).toBe(true);
    expect(isIdle(now, now)).toBe(false);
  });
  it('sem registro de atividade ou com relógio no futuro conta como expirada', () => {
    const now = 1_800_000_000_000;
    expect(isIdle(null, now)).toBe(true);
    expect(isIdle(now + TOUCH_INTERVAL_MS + 1, now)).toBe(true);
  });
  it('aceita só inteiros no registro de atividade', () => {
    expect(parseActivity('1800000000000')).toBe(1_800_000_000_000);
    for (const bad of [
      null,
      '',
      'abc',
      '-1',
      '1.5',
      '1e9',
      '99999999999999999',
    ])
      expect(parseActivity(bad)).toBeNull();
  });
  it('avisa o servidor no máximo uma vez por minuto', () => {
    expect(shouldTouch(null, 1000)).toBe(true);
    expect(shouldTouch(1000, 1000 + TOUCH_INTERVAL_MS - 1)).toBe(false);
    expect(shouldTouch(1000, 1000 + TOUCH_INTERVAL_MS)).toBe(true);
  });
});
