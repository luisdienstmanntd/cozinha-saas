import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountGateway } from '../application/accountGateway';
import { newPassword } from '../domain/account';

export function createAccountGateway(client: SupabaseClient): AccountGateway {
  return {
    async changePassword(password) {
      const parsed = newPassword.safeParse({ password, confirm: password });
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? 'Senha inválida.');
      const { error } = await client.auth.updateUser({ password });
      if (error)
        throw new Error(
          'Não foi possível trocar a senha. Confira a conexão e tente outra senha.',
        );
    },
    async factors() {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error)
        throw new Error(
          'Não foi possível consultar a verificação em duas etapas.',
        );
      return data.totp.map((factor) => ({
        id: factor.id,
        name: factor.friendly_name ?? null,
      }));
    },
    async startEnroll() {
      // Cadastros iniciados e nunca confirmados atrapalham um novo: saem antes.
      const listed = await client.auth.mfa.listFactors();
      const stale = (listed.data?.all ?? []).filter(
        (factor) =>
          factor.factor_type === 'totp' && factor.status === 'unverified',
      );
      for (const factor of stale)
        await client.auth.mfa.unenroll({ factorId: factor.id });
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'App autenticador',
      });
      if (error || !data)
        throw new Error(
          'Não foi possível iniciar a verificação em duas etapas. Ela pode não estar disponível neste ambiente.',
        );
      return {
        factorId: data.id,
        secret: data.totp.secret,
        uri: data.totp.uri,
      };
    },
    async confirmEnroll(factorId, code) {
      const { error } = await client.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (error)
        throw new Error(
          'Código incorreto ou vencido. Confira o app e tente de novo.',
        );
    },
    async cancelEnroll(factorId) {
      await client.auth.mfa.unenroll({ factorId });
    },
    async removeFactor(factorId, code) {
      // Remover o segundo fator exige provar que se tem o aplicativo agora.
      const verified = await client.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (verified.error)
        throw new Error(
          'Código incorreto ou vencido. Confira o app e tente de novo.',
        );
      const { error } = await client.auth.mfa.unenroll({ factorId });
      if (error)
        throw new Error(
          'Não foi possível remover a verificação em duas etapas.',
        );
    },
  };
}
