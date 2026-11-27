import { expect, it } from 'vitest';
import { newPassword, parseMfaCode } from './account';

it('a nova senha pede 8 a 72 caracteres e a confirmação igual', () => {
  const issue = (password: string, confirm: string) =>
    newPassword.safeParse({ password, confirm }).error?.issues[0]?.message;
  expect(issue('curta', 'curta')).toContain('pelo menos 8');
  expect(issue('x'.repeat(73), 'x'.repeat(73))).toContain('no máximo 72');
  expect(issue('senha-longa-1', 'senha-longa-2')).toContain('confirmação');
  expect(
    newPassword.safeParse({
      password: 'senha-longa-1',
      confirm: 'senha-longa-1',
    }).success,
  ).toBe(true);
});

it('o código do aplicativo tem seis dígitos; espaço e hífen digitados são ignorados', () => {
  expect(parseMfaCode('123456')).toBe('123456');
  expect(parseMfaCode('123 456')).toBe('123456');
  expect(parseMfaCode('123-456')).toBe('123456');
  for (const bad of ['', '12345', '1234567', 'abcdef', '12a456'])
    expect(parseMfaCode(bad)).toBeNull();
});
