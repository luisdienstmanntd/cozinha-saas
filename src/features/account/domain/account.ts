import { z } from 'zod';

// Minha conta: trocar a própria senha e proteger a entrada com um segundo fator (app autenticador).
// Nada aqui muda permissão, sessão de 30 minutos ou isolamento por unidade.

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 72;

export const newPassword = z
  .object({ password: z.string(), confirm: z.string() })
  .superRefine((value, ctx) => {
    if (value.password.length < MIN_PASSWORD)
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: `A nova senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`,
      });
    else if (value.password.length > MAX_PASSWORD)
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: `A nova senha pode ter no máximo ${MAX_PASSWORD} caracteres.`,
      });
    else if (value.password !== value.confirm)
      ctx.addIssue({
        code: 'custom',
        path: ['confirm'],
        message: 'A confirmação não é igual à nova senha.',
      });
  });

/** Código do app autenticador: seis dígitos (espaços e hífens digitados são ignorados). */
export function parseMfaCode(value: string): string | null {
  const digits = value.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

export type MfaFactor = { id: string; name: string | null };
export type MfaEnrollment = { factorId: string; secret: string; uri: string };
