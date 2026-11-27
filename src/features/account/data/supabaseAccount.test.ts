import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAccountGateway } from './supabaseAccount';

function clientWith(mfa: Record<string, unknown>, updateUser = vi.fn()) {
  return { auth: { mfa, updateUser } } as unknown as SupabaseClient;
}
const ok = { data: {}, error: null };

it('troca de senha: valida antes de enviar e esconde o motivo técnico do erro', async () => {
  const updateUser = vi.fn().mockResolvedValue({ error: null });
  const gateway = createAccountGateway(clientWith({}, updateUser));
  await expect(gateway.changePassword('curta')).rejects.toThrow('pelo menos 8');
  expect(updateUser).not.toHaveBeenCalled();
  await gateway.changePassword('senha-longa-1');
  expect(updateUser).toHaveBeenCalledWith({ password: 'senha-longa-1' });
  updateUser.mockResolvedValue({ error: { message: 'detalhe interno' } });
  await expect(gateway.changePassword('senha-longa-1')).rejects.toThrow(
    'Não foi possível trocar a senha',
  );
});

it('lista só os fatores TOTP confirmados', async () => {
  const listFactors = vi.fn().mockResolvedValue({
    data: { totp: [{ id: 'f1', friendly_name: 'App' }], all: [] },
    error: null,
  });
  expect(
    await createAccountGateway(clientWith({ listFactors })).factors(),
  ).toEqual([{ id: 'f1', name: 'App' }]);
  listFactors.mockResolvedValue({ data: null, error: { message: 'x' } });
  await expect(
    createAccountGateway(clientWith({ listFactors })).factors(),
  ).rejects.toThrow('verificação em duas etapas');
});

it('cadastro: descarta pendências antigas e devolve chave e endereço do QR', async () => {
  const unenroll = vi.fn().mockResolvedValue(ok);
  const listFactors = vi.fn().mockResolvedValue({
    data: {
      all: [
        { id: 'velho', factor_type: 'totp', status: 'unverified' },
        { id: 'ativo', factor_type: 'totp', status: 'verified' },
      ],
    },
    error: null,
  });
  const enroll = vi.fn().mockResolvedValue({
    data: { id: 'novo', totp: { secret: 'ABCD', uri: 'otpauth://totp/x' } },
    error: null,
  });
  const gateway = createAccountGateway(
    clientWith({ listFactors, unenroll, enroll }),
  );
  expect(await gateway.startEnroll()).toEqual({
    factorId: 'novo',
    secret: 'ABCD',
    uri: 'otpauth://totp/x',
  });
  expect(unenroll).toHaveBeenCalledTimes(1);
  expect(unenroll).toHaveBeenCalledWith({ factorId: 'velho' });
  enroll.mockResolvedValue({ data: null, error: { message: 'disabled' } });
  await expect(gateway.startEnroll()).rejects.toThrow(
    'Não foi possível iniciar',
  );
});

it('confirmar usa desafio e verificação; código errado vira mensagem em português', async () => {
  const challengeAndVerify = vi.fn().mockResolvedValue(ok);
  const gateway = createAccountGateway(clientWith({ challengeAndVerify }));
  await gateway.confirmEnroll('f1', '123456');
  expect(challengeAndVerify).toHaveBeenCalledWith({
    factorId: 'f1',
    code: '123456',
  });
  challengeAndVerify.mockResolvedValue({
    data: null,
    error: { message: 'Invalid' },
  });
  await expect(gateway.confirmEnroll('f1', '000000')).rejects.toThrow(
    'Código incorreto',
  );
});

it('remover exige o código antes e não remove se o código falhar', async () => {
  const challengeAndVerify = vi
    .fn()
    .mockResolvedValue({ data: null, error: { message: 'x' } });
  const unenroll = vi.fn().mockResolvedValue(ok);
  const gateway = createAccountGateway(
    clientWith({ challengeAndVerify, unenroll }),
  );
  await expect(gateway.removeFactor('f1', '000000')).rejects.toThrow(
    'Código incorreto',
  );
  expect(unenroll).not.toHaveBeenCalled();
  challengeAndVerify.mockResolvedValue(ok);
  await gateway.removeFactor('f1', '123456');
  expect(unenroll).toHaveBeenCalledWith({ factorId: 'f1' });
});
