import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localSupabase, checked } from '../../scripts/local-supabase.mjs';
import { verifyProject } from '../../scripts/hosted/verify-hosted.mjs';

// Fatia 8.4a (D-066): cadastro público restrito. O Supabase local roda com enable_signup=false, como o
// ambiente hospedado deve rodar. Mesmo se alguém conseguisse criar uma conta, ela não teria acesso a nada
// (defesa em profundidade: a autorização vem do vínculo, não da existência da conta).
test('cadastro público e login anônimo são recusados', async () => {
  const { admin, client } = localSupabase();
  const email = `autocadastro-${randomUUID()}@example.invalid`;
  const anonymous = client();
  const signUp = await anonymous.auth.signUp({ email, password: randomUUID() });
  assert.ok(signUp.error, 'signUp deve ser recusado');
  assert.equal(signUp.data.user, null);
  const anon = await client().auth.signInAnonymously();
  assert.ok(anon.error, 'login anônimo deve ser recusado');
  const users = checked(await admin.auth.admin.listUsers({ perPage: 1000 }));
  assert.equal(
    users.users.some((u) => u.email === email),
    false,
    'nenhuma conta foi criada',
  );
});

test('conta sem vínculo (como se tivesse se cadastrado) não enxerga nem cria nada', async () => {
  const { admin, client } = localSupabase();
  const email = `sem-vinculo-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const { user } = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  const orgId = randomUUID();
  try {
    checked(
      await admin
        .from('organizations')
        .insert({ id: orgId, name: `Alheia ${orgId}` }),
    );
    const person = client();
    checked(await person.auth.signInWithPassword({ email, password }));
    for (const table of [
      'organizations',
      'establishments',
      'memberships',
      'batch_receipts',
      'containers',
      'stock_movements',
    ]) {
      const rows = checked(await person.from(table).select('*'));
      assert.equal(
        rows.length,
        0,
        `${table} deve estar vazio para conta sem vínculo`,
      );
    }
    const create = await person
      .from('organizations')
      .insert({ name: 'Autocadastro' });
    assert.ok(create.error, 'conta sem vínculo não cria empresa');
    const join = await person
      .from('memberships')
      .insert({ organization_id: orgId, user_id: user.id, role: 'owner' });
    assert.ok(join.error, 'conta sem vínculo não se vincula a empresa');
    const establishment = await person
      .from('establishments')
      .insert({ organization_id: orgId, name: 'Invasora', timezone: 'UTC' });
    assert.ok(establishment.error, 'conta sem vínculo não cria unidade');
  } finally {
    await admin.from('organizations').delete().eq('id', orgId);
    await admin.auth.admin.deleteUser(user.id);
  }
});

test('API anônima não lê tabelas do aplicativo e o verificador de hospedagem passa no local', async () => {
  const { url, publishableKey } = localSupabase();
  const results = await verifyProject({ url, publishableKey });
  const failures = results.filter((r) => r.status === 'FALHA');
  assert.deepEqual(failures, [], JSON.stringify(failures));
});

// Sessões e vínculo: o acesso vem do vínculo ativo e da sessão válida, conferidos pelo banco a cada pedido.
test('vínculo revogado perde o acesso na hora, mesmo com a sessão ainda válida', async () => {
  const { admin, client } = localSupabase();
  const email = `revogado-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const orgId = randomUUID();
  const { user } = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  try {
    checked(
      await admin
        .from('organizations')
        .insert({ id: orgId, name: `Revoga ${orgId}` }),
    );
    checked(
      await admin
        .from('memberships')
        .insert({ organization_id: orgId, user_id: user.id, role: 'owner' }),
    );
    const person = client();
    checked(await person.auth.signInWithPassword({ email, password }));
    assert.equal(
      checked(await person.from('organizations').select('id')).length,
      1,
    );
    checked(
      await admin
        .from('memberships')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', user.id),
    );
    assert.equal(
      checked(await person.from('organizations').select('id')).length,
      0,
      'sem vínculo ativo, a mesma sessão não enxerga mais a empresa',
    );
  } finally {
    await admin.from('memberships').delete().eq('organization_id', orgId);
    await admin.from('organizations').delete().eq('id', orgId);
    await admin.auth.admin.deleteUser(user.id);
  }
});

test('sair encerra a sessão no servidor e token adulterado é recusado', async () => {
  const { url, publishableKey, admin, client } = localSupabase();
  const email = `sessao-${randomUUID()}@example.invalid`;
  const password = randomUUID();
  const { user } = checked(
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  try {
    const person = client();
    const { session } = checked(
      await person.auth.signInWithPassword({ email, password }),
    );
    const refreshToken = session.refresh_token;
    // Token adulterado (assinatura trocada) não autentica.
    const forged = `${session.access_token.slice(0, -4)}AAAA`;
    const response = await globalThis.fetch(
      `${url}/rest/v1/organizations?select=id`,
      {
        headers: { apikey: publishableKey, authorization: `Bearer ${forged}` },
      },
    );
    assert.ok(
      [401, 403].includes(response.status),
      `adulterado: HTTP ${response.status}`,
    );
    // Sair (escopo global) invalida o refresh token no servidor.
    checked(await person.auth.signOut({ scope: 'global' }));
    const again = await client().auth.refreshSession({
      refresh_token: refreshToken,
    });
    assert.ok(
      again.error,
      'o refresh token de uma sessão encerrada não renova',
    );
  } finally {
    await admin.auth.admin.deleteUser(user.id);
  }
});
