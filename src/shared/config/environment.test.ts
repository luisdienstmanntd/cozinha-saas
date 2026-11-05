import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './environment';

describe('configuração de demonstração', () => {
  it('usa demonstração quando não há configuração', () => {
    expect(parseEnvironment({})).toEqual({ mode: 'demo' });
  });
  it('aceita modo explicitamente informado', () => {
    expect(parseEnvironment({ VITE_APP_MODE: 'demo' }).mode).toBe('demo');
  });
  it.each(['production', '', 'Demo'])(
    'recusa modo não suportado: %s',
    (mode) => {
      expect(() => parseEnvironment({ VITE_APP_MODE: mode })).toThrow(
        'VITE_APP_MODE deve ser demo nesta fase.',
      );
    },
  );
});
