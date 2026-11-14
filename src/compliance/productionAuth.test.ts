import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// P4: o exemplo de autenticação hospedada não pode voltar a valores fracos. Leitura simples por seção.
const text = readFileSync('supabase/production/auth.example.toml', 'utf8');
function section(name: string): Record<string, string> {
  const start = text.indexOf(`[${name}]`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + name.length + 2);
  const end = rest.search(/^\[/m);
  const body = end === -1 ? rest : rest.slice(0, end);
  return Object.fromEntries(
    body
      .split('\n')
      .map((line) => line.match(/^(\w+)\s*=\s*(.+?)\s*$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1]!, match[2]!.replace(/^"|"$/g, '')]),
  );
}

it('autenticação hospedada: senha forte, confirmação de e-mail, MFA e sem cadastro aberto', () => {
  const auth = section('auth');
  expect(Number(auth.minimum_password_length)).toBeGreaterThanOrEqual(10);
  expect(auth.password_requirements).toBe('lower_upper_letters_digits_symbols');
  expect(auth.enable_signup).toBe('false');
  expect(auth.enable_anonymous_sign_ins).toBe('false');
  const email = section('auth.email');
  expect(email.enable_confirmations).toBe('true');
  expect(email.secure_password_change).toBe('true');
  const totp = section('auth.mfa.totp');
  expect(totp.enroll_enabled).toBe('true');
  expect(totp.verify_enabled).toBe('true');
  const limits = section('auth.rate_limit');
  expect(Number(limits.sign_in_sign_ups)).toBeLessThanOrEqual(30);
});

it('o exemplo não carrega segredo nem endereço de ambiente real', () => {
  expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sb_secret_|https?:\/\//);
});
