import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localSupabase, checked } from '../../scripts/local-supabase.mjs';

test('autenticação e isolamento real via API Supabase local', async (t) => {
  const { admin, client } = localSupabase();
  const users = [];
  const orgs = [randomUUID(), randomUUID()];
  const clients = [];
  const password = randomUUID();
  try {
    for (let i = 0; i < 3; i++) {
      const email = `fase2-${randomUUID()}@example.invalid`;
      const { user } = checked(
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        }),
      );
      users.push(user.id);
      const c = client();
      checked(await c.auth.signInWithPassword({ email, password }));
      clients.push(c);
    }
    checked(
      await admin
        .from('organizations')
        .insert(orgs.map((id, i) => ({ id, name: `Teste ${i}` }))),
    );
    checked(
      await admin.from('memberships').insert(
        users.map((user_id, i) => ({
          user_id,
          organization_id: orgs[i === 1 ? 1 : 0],
          role: i === 2 ? 'member' : 'owner',
        })),
      ),
    );
    checked(
      await admin.from('establishments').insert(
        orgs.map((organization_id, i) => ({
          organization_id,
          name: `Unidade ${i}`,
          timezone: 'America/Sao_Paulo',
        })),
      ),
    );

    for (let i = 0; i < 2; i++) {
      const c = clients[i];
      const own = orgs[i];
      const other = orgs[1 - i];
      await t.test(
        `owner ${i}: leitura, edição, unidades e joins isolados`,
        async () => {
          const rows = checked(
            await c
              .from('organizations')
              .select(
                'id,establishments(id,organization_id),memberships(user_id)',
              ),
          );
          assert.equal(rows.length, 1);
          assert.equal(rows[0].id, own);
          assert.equal(rows[0].establishments.length, 1);
          assert.equal(rows[0].establishments[0].organization_id, own);
          assert.equal(rows[0].memberships.length, i === 0 ? 2 : 1);
          const name = `Editada ${i}`;
          const changed = checked(
            await c
              .from('organizations')
              .update({ name })
              .eq('id', own)
              .select(),
          );
          assert.equal(changed.length, 1);
          assert.equal(changed[0].name, name);
          assert.equal(
            checked(
              await c
                .from('organizations')
                .update({ name: 'Ataque' })
                .eq('id', other)
                .select(),
            ).length,
            0,
          );
          const inserted = checked(
            await c
              .from('establishments')
              .insert({ organization_id: own, name: 'Nova', timezone: 'UTC' })
              .select(),
          );
          assert.equal(inserted.length, 1);
          const units = checked(
            await c
              .from('establishments')
              .update({ name: 'Editada', timezone: 'America/Sao_Paulo' })
              .eq('id', inserted[0].id)
              .select(),
          );
          assert.equal(units[0].name, 'Editada');
          assert.equal(
            checked(
              await c
                .from('establishments')
                .update({ name: 'Ataque' })
                .eq('organization_id', other)
                .select(),
            ).length,
            0,
          );
        },
      );
      await t.test(`owner ${i}: falsificação e escalada negadas`, async () => {
        assert.ok(
          (
            await c
              .from('establishments')
              .insert({
                organization_id: other,
                name: 'Ataque',
                timezone: 'UTC',
              })
          ).error,
        );
        assert.ok(
          (
            await c
              .from('establishments')
              .insert({
                organization_id: randomUUID(),
                name: 'Ataque',
                timezone: 'UTC',
              })
          ).error,
        );
        assert.ok(
          (
            await c
              .from('establishments')
              .update({ organization_id: other })
              .eq('organization_id', own)
          ).error,
        );
        assert.ok(
          (await c.from('organizations').insert({ name: 'Falsa' })).error,
        );
        assert.ok(
          (
            await c
              .from('memberships')
              .insert({
                organization_id: other,
                user_id: users[i],
                role: 'owner',
              })
          ).error,
        );
        for (const change of [
          { role: 'owner' },
          { organization_id: other },
          { user_id: users[1 - i] },
          { revoked_at: null },
        ]) {
          assert.ok(
            (await c.from('memberships').update(change).eq('user_id', users[i]))
              .error,
          );
        }
        for (const table of [
          'organizations',
          'establishments',
          'memberships',
        ]) {
          assert.ok(
            (
              await c
                .from(table)
                .delete()
                .eq(table === 'organizations' ? 'id' : 'organization_id', own)
            ).error,
          );
        }
        assert.ok(
          (
            await c
              .from('establishments')
              .insert({
                organization_id: own,
                name: 'Inválida',
                timezone: 'Invalid/Zone',
              })
          ).error,
        );
      });
    }
    await t.test(
      'colaborador lê sem editar nem promover a si mesmo',
      async () => {
        const c = clients[2];
        assert.equal(checked(await c.from('organizations').select()).length, 1);
        assert.equal(checked(await c.from('memberships').select()).length, 1);
        assert.equal(
          checked(
            await c
              .from('organizations')
              .update({ name: 'Ataque' })
              .eq('id', orgs[0])
              .select(),
          ).length,
          0,
        );
        assert.equal(
          checked(
            await c
              .from('establishments')
              .update({ name: 'Ataque' })
              .eq('organization_id', orgs[0])
              .select(),
          ).length,
          0,
        );
        assert.ok(
          (
            await c
              .from('establishments')
              .insert({
                organization_id: orgs[0],
                name: 'Ataque',
                timezone: 'UTC',
              })
          ).error,
        );
        assert.ok(
          (
            await c
              .from('memberships')
              .update({ role: 'owner' })
              .eq('user_id', users[2])
          ).error,
        );
        checked(
          await c.auth.updateUser({
            data: { role: 'owner', organization_id: orgs[1] },
          }),
        );
        checked(await c.auth.refreshSession());
        const { claims } = checked(await c.auth.getClaims());
        assert.equal(claims.user_metadata?.role, 'owner');
        assert.equal(claims.user_metadata?.organization_id, orgs[1]);
        assert.equal(
          checked(await c.from('organizations').select('id'))[0].id,
          orgs[0],
        );
        assert.equal(
          checked(
            await c
              .from('organizations')
              .update({ name: 'Ataque' })
              .eq('id', orgs[0])
              .select(),
          ).length,
          0,
        );
      },
    );
    await t.test(
      'revogação bloqueia leituras e escritas com o mesmo token',
      async () => {
        const c = clients[0];
        const token = (await c.auth.getSession()).data.session.access_token;
        checked(
          await admin
            .from('memberships')
            .update({ revoked_at: new Date().toISOString() })
            .eq('user_id', users[0]),
        );
        for (const table of [
          'organizations',
          'establishments',
          'memberships',
        ]) {
          assert.deepEqual(checked(await c.from(table).select()), []);
        }
        assert.deepEqual(
          checked(
            await c
              .from('organizations')
              .update({ name: 'Ataque' })
              .eq('id', orgs[0])
              .select(),
          ),
          [],
        );
        assert.ok(
          (
            await c
              .from('establishments')
              .insert({
                organization_id: orgs[0],
                name: 'Ataque',
                timezone: 'UTC',
              })
          ).error,
        );
        assert.equal(
          (await c.auth.getSession()).data.session.access_token,
          token,
        );
      },
    );
    await t.test(
      'anônimo e logout não acessam tabelas protegidas',
      async () => {
        const anonymous = client();
        for (const table of [
          'organizations',
          'establishments',
          'memberships',
        ]) {
          assert.ok((await anonymous.from(table).select()).error);
        }
        checked(await clients[1].auth.signOut());
        assert.equal((await clients[1].auth.getSession()).data.session, null);
        assert.ok((await clients[1].from('organizations').select()).error);
      },
    );
    await t.test(
      'tentativas negadas não alteraram empresa nem vínculos',
      async () => {
        const rows = checked(
          await admin.from('organizations').select('id,name').in('id', orgs),
        );
        for (const row of rows)
          assert.equal(row.name, `Editada ${orgs.indexOf(row.id)}`);
        const memberships = checked(
          await admin
            .from('memberships')
            .select('user_id,role')
            .in('user_id', users),
        );
        assert.equal(memberships.length, 3);
        assert.equal(
          memberships.find((m) => m.user_id === users[2]).role,
          'member',
        );
      },
    );
  } finally {
    // Physical cleanup is restricted to randomly generated disposable fixtures, never application behavior.
    // A auditoria de nome/fuso é append-only (Fase 6.0c): quem tem auditoria fica no banco local, com
    // IDs e e-mails aleatórios (mesmo critério da limpeza de histórico da 6.0a).
    const audited = await admin
      .from('entity_changes')
      .select('id', { count: 'exact', head: true })
      .in('organization_id', orgs);
    checked(audited);
    if (audited.count === 0) {
      checked(
        await admin.from('establishments').delete().in('organization_id', orgs),
      );
      checked(
        await admin.from('memberships').delete().in('organization_id', orgs),
      );
      checked(await admin.from('organizations').delete().in('id', orgs));
      for (const id of users) checked(await admin.auth.admin.deleteUser(id));
    }
    for (const c of clients) await c.auth.signOut({ scope: 'local' });
  }
});
