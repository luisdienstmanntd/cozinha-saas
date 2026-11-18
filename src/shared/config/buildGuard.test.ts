import { describe, expect, it } from 'vitest';
import { assertBuildEnvironment } from './buildGuard';
import { contentSecurityPolicy, headersFile } from '../security/headers';

const hosted = {
  VITE_APP_MODE: 'hosted',
  VITE_SUPABASE_URL: 'https://abcdefghij0123456789.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_exemplo_sem_segredo',
  VITE_APP_ENV: 'testes',
  VITE_APP_URL: 'https://cozzigo.pages.dev',
};

describe('validação do build', () => {
  it('build local sem hospedagem passa sem exigir nada', () => {
    expect(assertBuildEnvironment({})).toEqual({ hosted: false });
    expect(assertBuildEnvironment({ VITE_APP_MODE: 'demo' })).toEqual({
      hosted: false,
    });
  });
  it('na hospedagem, ausência de variáveis interrompe o build', () => {
    expect(() => assertBuildEnvironment({ CF_PAGES: '1' })).toThrow(
      'Build interrompido',
    );
    expect(() =>
      assertBuildEnvironment({ CF_PAGES: '1', VITE_APP_MODE: 'demo' }),
    ).toThrow('Build interrompido');
  });
  it('na hospedagem, o modo local também interrompe', () => {
    expect(() =>
      assertBuildEnvironment({
        CF_PAGES: '1',
        VITE_APP_MODE: 'local',
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_exemplo_sem_segredo',
      }),
    ).toThrow('Build interrompido');
  });
  it('a demonstração pública exige pedido explícito', () => {
    expect(
      assertBuildEnvironment({
        CF_PAGES: '1',
        VITE_APP_MODE: 'demo',
        VITE_ALLOW_PUBLIC_DEMO: 'true',
      }),
    ).toEqual({ hosted: false });
  });
  it('configuração hospedada completa passa e devolve o endereço', () => {
    expect(assertBuildEnvironment({ CF_PAGES: '1', ...hosted })).toEqual({
      hosted: true,
      supabaseUrl: 'https://abcdefghij0123456789.supabase.co',
    });
  });
  it('pedir hosted fora da hospedagem também valida', () => {
    expect(() => assertBuildEnvironment({ VITE_APP_MODE: 'hosted' })).toThrow(
      'Build interrompido',
    );
  });
  it('recusa variável pública com cara de segredo e não imprime o valor', () => {
    const secret = 'sb_secret_valor_que_nao_pode_vazar_123';
    let message = '';
    try {
      assertBuildEnvironment({ ...hosted, VITE_CHAVE: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('VITE_CHAVE');
    expect(message).not.toContain(secret);
    expect(() =>
      assertBuildEnvironment({
        ...hosted,
        VITE_SUPABASE_SERVICE_ROLE_KEY: 'x',
      }),
    ).toThrow('segredo');
  });
});

describe('cabeçalhos de segurança', () => {
  const origin = 'https://abcdefghij0123456789.supabase.co';
  it('a política só permite a própria origem e o projeto Supabase', () => {
    const csp = contentSecurityPolicy(origin);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`connect-src 'self' ${origin}`);
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });
  it('o arquivo traz os cabeçalhos esperados', () => {
    const file = headersFile(origin);
    for (const name of [
      'Content-Security-Policy',
      'Strict-Transport-Security',
      'X-Content-Type-Options: nosniff',
      'X-Frame-Options: DENY',
      'Referrer-Policy: no-referrer',
      'Permissions-Policy',
      'Cross-Origin-Opener-Policy: same-origin',
    ])
      expect(file).toContain(name);
    expect(file.startsWith('/*\n')).toBe(true);
  });
});
