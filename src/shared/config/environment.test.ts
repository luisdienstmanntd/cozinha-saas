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
        'Configuração inválida:',
      );
    },
  );
  it('aceita configuração local e recusa chave privilegiada ou URL remota', () => {
    const local = {
      VITE_APP_MODE: 'local',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_exemplo_sem_segredo',
    };
    expect(parseEnvironment(local).mode).toBe('local');
    expect(() =>
      parseEnvironment({
        ...local,
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_exemplo',
      }),
    ).toThrow();
    expect(() =>
      parseEnvironment({
        ...local,
        VITE_SUPABASE_URL: 'https://example.supabase.co',
      }),
    ).toThrow();
    expect(() => parseEnvironment({ VITE_APP_MODE: 'local' })).toThrow();
  });
});
