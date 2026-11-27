import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createIdentityGateway } from './supabaseIdentity';

const good = (n: number) => ({
  id: `20000000-0000-4000-8000-00000000000${n}`,
  name: `Empresa ${n}`,
  establishments: [
    {
      id: `30000000-0000-4000-8000-00000000000${n}`,
      name: 'Unidade',
      timezone: 'America/Sao_Paulo',
    },
  ],
  memberships: [
    { user_id: '10000000-0000-4000-8000-000000000001', role: 'owner' },
  ],
});
function gatewayFor(data: unknown, error: unknown = null) {
  const select = vi.fn().mockResolvedValue({ data, error });
  const from = vi.fn(() => ({ select }));
  return createIdentityGateway({ from } as unknown as SupabaseClient);
}

it('uma empresa com dado inesperado não esconde as outras (P7)', async () => {
  const bad = { ...good(2), memberships: [{ user_id: 'x', role: 'dono' }] };
  const report = await gatewayFor([good(1), bad, good(3)]).loadReport!();
  expect(report.access.map((org) => org.name)).toEqual([
    'Empresa 1',
    'Empresa 3',
  ]);
  expect(report.skipped).toBe(1);
  expect(await gatewayFor([good(1), bad]).load()).toHaveLength(1);
});

it('todas válidas: nenhuma ignorada; erro de consulta continua sendo erro', async () => {
  expect((await gatewayFor([good(1)]).loadReport!()).skipped).toBe(0);
  await expect(
    gatewayFor(null, { code: '42501' }).loadReport!(),
  ).rejects.toThrow('Não foi possível consultar o acesso');
  await expect(gatewayFor({ nao: 'lista' }).loadReport!()).rejects.toThrow(
    'Não foi possível consultar o acesso',
  );
});

it('recusa atrasada do token de quem já saiu não encerra a sessão atual', async () => {
  let expired: (token: string | null) => void = () => {};
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const getSession = vi
    .fn()
    .mockResolvedValue({ data: { session: { access_token: 'token-atual' } } });
  createIdentityGateway(
    { auth: { signOut, getSession } } as unknown as SupabaseClient,
    {
      events: {
        fetch: vi.fn(),
        onExpired: (listener: (token: string | null) => void) => {
          expired = listener;
          return () => {};
        },
      },
      storage: null,
    },
  );
  expired('token-de-quem-saiu');
  await vi.waitFor(() => expect(getSession).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(signOut).not.toHaveBeenCalled();
  expired('token-atual');
  await vi.waitFor(() =>
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' }),
  );
  signOut.mockClear();
  // Sem token na requisição, vale o comportamento anterior: encerra.
  expired(null);
  await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
});

function mfaGateway(
  level: { data: unknown; error?: unknown },
  factors: unknown[] = [],
) {
  const getAuthenticatorAssuranceLevel = vi
    .fn()
    .mockResolvedValue({ error: null, ...level });
  const challengeAndVerify = vi
    .fn()
    .mockResolvedValue({ data: {}, error: null });
  const getSession = vi.fn().mockResolvedValue({
    data: { session: { user: { id: 'u1', email: 'ana@example.invalid' } } },
    error: null,
  });
  const listFactors = vi
    .fn()
    .mockResolvedValue({ data: { totp: factors }, error: null });
  const client = {
    auth: {
      getSession,
      mfa: { getAuthenticatorAssuranceLevel, challengeAndVerify, listFactors },
    },
  } as unknown as SupabaseClient;
  return { gateway: createIdentityGateway(client), challengeAndVerify };
}

it('segundo fator: senha aceita sem código (aal1 → aal2) ainda não é entrada completa', async () => {
  const pending = mfaGateway({
    data: { currentLevel: 'aal1', nextLevel: 'aal2' },
  });
  expect(await pending.gateway.mfaRequired!()).toBe(true);
  expect(await pending.gateway.currentUser!()).toBeNull();
});

it('segundo fator: quem não ativou ou já confirmou segue normalmente', async () => {
  for (const level of [
    { currentLevel: 'aal1', nextLevel: 'aal1' },
    { currentLevel: 'aal2', nextLevel: 'aal2' },
  ]) {
    const { gateway } = mfaGateway({ data: level });
    expect(await gateway.mfaRequired!()).toBe(false);
    expect(await gateway.currentUser!()).toEqual({
      id: 'u1',
      email: 'ana@example.invalid',
    });
  }
});

it('segundo fator: falha ao consultar o nível nega por padrão', async () => {
  const { gateway } = mfaGateway({ data: null, error: { message: 'x' } });
  expect(await gateway.mfaRequired!()).toBe(true);
  expect(await gateway.currentUser!()).toBeNull();
});

it('segundo fator: confirma o código no fator do usuário', async () => {
  const { gateway, challengeAndVerify } = mfaGateway(
    { data: { currentLevel: 'aal1', nextLevel: 'aal2' } },
    [{ id: 'f1' }],
  );
  await gateway.verifyMfa!('123456');
  expect(challengeAndVerify).toHaveBeenCalledWith({
    factorId: 'f1',
    code: '123456',
  });
  challengeAndVerify.mockResolvedValue({ data: null, error: { message: 'x' } });
  await expect(gateway.verifyMfa!('000000')).rejects.toThrow(
    'Código incorreto',
  );
  const none = mfaGateway(
    { data: { currentLevel: 'aal1', nextLevel: 'aal2' } },
    [],
  );
  await expect(none.gateway.verifyMfa!('123456')).rejects.toThrow(
    'entrar de novo',
  );
});
