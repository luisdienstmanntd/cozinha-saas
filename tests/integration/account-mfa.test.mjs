// Minha conta: trocar senha e segundo fator (app autenticador, TOTP) contra o Auth local, sem tocar
// no banco da aplicação. Mostra o que a tela depende e o que NÃO muda:
// - ativar exige confirmar um código; entrar de novo só com senha fica em aal1 com próximo nível aal2;
// - confirmar o código leva a aal2; remover o fator exige o código atual (feito pela tela);
// - touch_session (regra dos 30 minutos) funciona nos dois níveis, sem alteração de banco;
// - o banco NÃO exige aal2 hoje: exigir seria outra proposta (política/migração), fora desta fatia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localSupabase, checked } from '../../scripts/local-supabase.mjs';
import { totp } from '../../scripts/totp.mjs';

test('Minha conta: senha, segundo fator e regra de sessão', async () => {
  const { admin, client } = localSupabase();
  const email = `conta-${randomUUID()}@example.invalid`;
  const password = `Senha-${randomUUID()}`;
  const created = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  try {
    const first = client();
    checked(await first.auth.signInWithPassword({ email, password }));
    let level = checked(await first.auth.mfa.getAuthenticatorAssuranceLevel());
    assert.equal(level.nextLevel, 'aal1', 'sem fator, nada pede segundo passo');

    const enrolled = checked(
      await first.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Teste',
      }),
    );
    // Cadastro iniciado e não confirmado não conta como fator ativo.
    let listed = checked(await first.auth.mfa.listFactors());
    assert.equal(listed.totp.length, 0);
    const wrong = await first.auth.mfa.challengeAndVerify({
      factorId: enrolled.id,
      code: '000000',
    });
    assert.ok(wrong.error, 'código errado é recusado');
    checked(
      await first.auth.mfa.challengeAndVerify({
        factorId: enrolled.id,
        code: totp(enrolled.totp.secret),
      }),
    );
    level = checked(await first.auth.mfa.getAuthenticatorAssuranceLevel());
    assert.equal(level.currentLevel, 'aal2');
    assert.equal(checked(await first.auth.mfa.listFactors()).totp.length, 1);

    // Nova entrada só com a senha: aal1, com aal2 pendente — a tela pede o código.
    const second = client();
    checked(await second.auth.signInWithPassword({ email, password }));
    level = checked(await second.auth.mfa.getAuthenticatorAssuranceLevel());
    assert.equal(level.currentLevel, 'aal1');
    assert.equal(level.nextLevel, 'aal2');
    // A regra dos 30 minutos continua valendo nos dois níveis (sem migração).
    checked(await second.rpc('touch_session'));
    listed = checked(await second.auth.mfa.listFactors());
    checked(
      await second.auth.mfa.challengeAndVerify({
        factorId: listed.totp[0].id,
        code: totp(enrolled.totp.secret),
      }),
    );
    level = checked(await second.auth.mfa.getAuthenticatorAssuranceLevel());
    assert.equal(level.currentLevel, 'aal2');
    checked(await second.rpc('touch_session'));

    // Trocar a senha mantém a sessão; a senha antiga deixa de valer, a nova vale.
    const next = `Outra-${randomUUID()}`;
    checked(await second.auth.updateUser({ password: next }));
    assert.ok(
      (await client().auth.signInWithPassword({ email, password })).error,
      'senha antiga recusada',
    );
    checked(await client().auth.signInWithPassword({ email, password: next }));

    // Remover o fator: com o código confirmado agora, a conta volta a entrar só com a senha.
    checked(await second.auth.mfa.unenroll({ factorId: listed.totp[0].id }));
    const third = client();
    checked(await third.auth.signInWithPassword({ email, password: next }));
    level = checked(await third.auth.mfa.getAuthenticatorAssuranceLevel());
    assert.equal(level.nextLevel, 'aal1');
  } finally {
    await admin.auth.admin.deleteUser(created.user.id);
  }
});
