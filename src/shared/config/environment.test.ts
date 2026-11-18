import { describe, expect, it } from 'vitest';
import { assertModeAllowedOnHost, parseEnvironment } from './environment';

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

describe('configuração hospedada (fatia 8.4a)', () => {
  const hosted = {
    VITE_APP_MODE: 'hosted',
    VITE_SUPABASE_URL: 'https://abcdefghij0123456789.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_exemplo_sem_segredo',
    VITE_APP_ENV: 'testes',
  };
  it('aceita a configuração hospedada completa', () => {
    expect(parseEnvironment(hosted)).toEqual({
      mode: 'hosted',
      url: 'https://abcdefghij0123456789.supabase.co',
      publishableKey: 'sb_publishable_exemplo_sem_segredo',
      environmentName: 'testes',
    });
    expect(parseEnvironment({ ...hosted, VITE_APP_ENV: 'producao' }).mode).toBe(
      'hosted',
    );
  });
  it.each([
    ['sem endereço', { VITE_SUPABASE_URL: undefined }],
    ['sem chave', { VITE_SUPABASE_PUBLISHABLE_KEY: undefined }],
    ['sem nome do ambiente', { VITE_APP_ENV: undefined }],
    ['nome de ambiente desconhecido', { VITE_APP_ENV: 'staging' }],
    ['chave secreta', { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_exemplo' }],
    [
      'chave JWT antiga',
      {
        VITE_SUPABASE_PUBLISHABLE_KEY:
          'eyJhbGciOiJIUzI1NiJ9.exemplo.assinatura',
      },
    ],
    [
      'http sem TLS',
      { VITE_SUPABASE_URL: 'http://abcdefghij0123456789.supabase.co' },
    ],
    ['outro domínio', { VITE_SUPABASE_URL: 'https://example.com' }],
    [
      'domínio parecido',
      {
        VITE_SUPABASE_URL: 'https://abcdefghij0123456789.supabase.co.evil.test',
      },
    ],
    [
      'com caminho',
      { VITE_SUPABASE_URL: 'https://abcdefghij0123456789.supabase.co/rest/v1' },
    ],
    [
      'com barra final',
      { VITE_SUPABASE_URL: 'https://abcdefghij0123456789.supabase.co/' },
    ],
    [
      'com usuário',
      { VITE_SUPABASE_URL: 'https://u:p@abcdefghij0123456789.supabase.co' },
    ],
    ['URL local', { VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }],
  ])('recusa configuração hospedada %s', (_nome, change) => {
    expect(() => parseEnvironment({ ...hosted, ...change })).toThrow(
      'Configuração inválida:',
    );
  });
});

describe('modo permitido por máquina', () => {
  it('aceita demonstração e local só em máquina local', () => {
    expect(() =>
      assertModeAllowedOnHost('demo', 'localhost', {}),
    ).not.toThrow();
    expect(() =>
      assertModeAllowedOnHost('local', '127.0.0.1', {}),
    ).not.toThrow();
  });
  it('recusa demonstração e local numa hospedagem pública', () => {
    expect(() =>
      assertModeAllowedOnHost('demo', 'cozinha.pages.dev', {}),
    ).toThrow('hosted');
    expect(() =>
      assertModeAllowedOnHost('local', 'cozinha.pages.dev', {}),
    ).toThrow('hosted');
  });
  it('a demonstração pública exige pedido explícito', () => {
    const input = { VITE_ALLOW_PUBLIC_DEMO: 'true' };
    expect(() =>
      assertModeAllowedOnHost('demo', 'cozinha.pages.dev', input),
    ).not.toThrow();
    expect(() =>
      assertModeAllowedOnHost('local', 'cozinha.pages.dev', input),
    ).toThrow();
  });
  it('o modo hosted vale em qualquer máquina', () => {
    expect(() =>
      assertModeAllowedOnHost('hosted', 'cozinha.pages.dev', {}),
    ).not.toThrow();
  });
});
