import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { localSupabase, checked } from '../../scripts/local-supabase.mjs';

// V2 (D-025): a sessão expira por inatividade (30 min) no banco, não só na tela.
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
function sql(text) {
  return execFileSync(
    'psql',
    [DB, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', text],
    {
      encoding: 'utf8',
    },
  ).trim();
}
const sessionOf = (client) =>
  client.auth.getSession().then(({ data }) => {
    const [, payload] = data.session.access_token.split('.');
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).session_id;
  });

test('sessão: expiração, Sair, troca de usuário e isolamento no servidor', async (t) => {
  const { admin, client, url, publishableKey } = localSupabase();
  const orgs = [randomUUID(), randomUUID()];
  const users = [];
  const password = randomUUID();
  async function newUser(organization_id, role) {
    const email = `v2-${randomUUID()}@example.invalid`;
    const { user } = checked(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      }),
    );
    checked(
      await admin
        .from('memberships')
        .insert({ organization_id, user_id: user.id, role }),
    );
    users.push(user.id);
    return { id: user.id, email };
  }
  async function login(email) {
    const c = client();
    checked(await c.auth.signInWithPassword({ email, password }));
    return c;
  }
  try {
    checked(
      await admin
        .from('organizations')
        .insert(orgs.map((id, i) => ({ id, name: `Sessão ${i}` }))),
    );
    const a = await newUser(orgs[0], 'owner');
    const b = await newUser(orgs[1], 'owner');

    await t.test(
      'sessão nova lê só a própria empresa e registra atividade',
      async () => {
        const c = await login(a.email);
        const rows = checked(await c.from('organizations').select('id'));
        assert.deepEqual(
          rows.map((r) => r.id),
          [orgs[0]],
        );
        checked(await c.rpc('touch_session'));
        const sid = await sessionOf(c);
        assert.equal(
          sql(
            `select count(*) from private.session_activity where session_id='${sid}'`,
          ),
          '1',
        );
      },
    );

    await t.test(
      '30 minutos sem atividade: leitura, escrita e RPC recusadas com 401',
      async () => {
        const c = await login(a.email);
        checked(await c.rpc('touch_session'));
        const sid = await sessionOf(c);
        sql(
          `update private.session_activity set last_seen_at = now() - interval '31 minutes' where session_id='${sid}'`,
        );
        const read = await c.from('organizations').select('id');
        assert.equal(read.status, 401);
        assert.equal(read.error.code, 'SESSION_EXPIRED');
        const write = await c
          .from('organizations')
          .update({ name: 'Invadida' })
          .eq('id', orgs[0]);
        assert.equal(write.status, 401);
        const touch = await c.rpc('touch_session');
        assert.equal(touch.status, 401, 'expirada não se reativa sozinha');
        assert.equal(
          checked(
            await admin.from('organizations').select('name').eq('id', orgs[0]),
          )[0].name,
          'Sessão 0',
        );
      },
    );

    await t.test(
      '29 minutos ainda valem e a atividade renova o prazo',
      async () => {
        const c = await login(a.email);
        checked(await c.rpc('touch_session'));
        const sid = await sessionOf(c);
        sql(
          `update private.session_activity set last_seen_at = now() - interval '29 minutes' where session_id='${sid}'`,
        );
        checked(await c.from('organizations').select('id'));
        checked(await c.rpc('touch_session'));
        assert.equal(
          sql(
            `select last_seen_at > now() - interval '1 minute' from private.session_activity where session_id='${sid}'`,
          ),
          't',
        );
      },
    );

    await t.test(
      'sessão que nunca registrou atividade expira 30 minutos depois do login',
      async () => {
        const c = await login(a.email);
        const sid = await sessionOf(c);
        sql(
          `update auth.sessions set created_at = now() - interval '31 minutes' where id='${sid}'`,
        );
        const read = await c.from('organizations').select('id');
        assert.equal(read.error?.code, 'SESSION_EXPIRED');
      },
    );

    await t.test(
      'Sair apaga a sessão: o token copiado antes deixa de valer na hora',
      async () => {
        const c = await login(a.email);
        const { data } = await c.auth.getSession();
        const token = data.session.access_token;
        checked(await c.rpc('touch_session'));
        checked(await c.auth.signOut({ scope: 'local' }));
        const response = await globalThis.fetch(
          `${url}/rest/v1/organizations?select=id`,
          {
            headers: {
              apikey: publishableKey,
              authorization: `Bearer ${token}`,
            },
          },
        );
        assert.equal(response.status, 401);
        assert.equal((await response.json()).code, 'SESSION_EXPIRED');
      },
    );

    await t.test(
      'troca de usuário: cada sessão vê só a própria empresa',
      async () => {
        const ca = await login(a.email);
        const cb = await login(b.email);
        assert.deepEqual(
          checked(await ca.from('organizations').select('id')).map((r) => r.id),
          [orgs[0]],
        );
        assert.deepEqual(
          checked(await cb.from('organizations').select('id')).map((r) => r.id),
          [orgs[1]],
        );
        // Expirar a sessão de A não afeta a de B.
        checked(await ca.rpc('touch_session'));
        sql(
          `update private.session_activity set last_seen_at = now() - interval '40 minutes' where session_id='${await sessionOf(ca)}'`,
        );
        assert.equal((await ca.from('organizations').select('id')).status, 401);
        checked(await cb.from('organizations').select('id'));
      },
    );

    await t.test(
      'não há como forjar atividade de outra sessão nem ler a tabela',
      async () => {
        const ca = await login(a.email);
        const cb = await login(b.email);
        checked(await cb.rpc('touch_session'));
        const sidB = await sessionOf(cb);
        sql(
          `update private.session_activity set last_seen_at = now() - interval '40 minutes' where session_id='${sidB}'`,
        );
        checked(await ca.rpc('touch_session'));
        assert.equal(
          sql(
            `select last_seen_at < now() - interval '39 minutes' from private.session_activity where session_id='${sidB}'`,
          ),
          't',
          'a sessão de A não renova a de B',
        );
        const direct = await ca
          .schema('private')
          .from('session_activity')
          .select('*');
        assert.ok(direct.error, 'tabela privada não é exposta pela API');
        const anon = await client().rpc('touch_session');
        assert.ok(anon.error);
      },
    );

    await t.test('sem login e com chave anônima, nada é lido', async () => {
      const anon = client();
      const rows = await anon.from('organizations').select('id');
      assert.deepEqual(rows.data ?? [], []);
    });

    await t.test(
      'funções de escrita também recusam sessão expirada',
      async () => {
        const c = await login(a.email);
        checked(await c.rpc('touch_session'));
        sql(
          `update private.session_activity set last_seen_at = now() - interval '31 minutes' where session_id='${await sessionOf(c)}'`,
        );
        const r = await c.rpc('set_member_display_name', {
          p_organization_id: orgs[0],
          p_user_id: a.id,
          p_display_name: 'Ana',
        });
        assert.equal(r.status, 401);
      },
    );
  } finally {
    // Histórico de auditoria impede apagar tudo; remove o que for possível.
    await admin.from('memberships').delete().in('organization_id', orgs);
    await admin.from('organizations').delete().in('id', orgs);
    for (const id of users) await admin.auth.admin.deleteUser(id);
  }
});
