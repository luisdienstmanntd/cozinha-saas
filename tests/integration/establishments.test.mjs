import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localSupabase, checked } from '../../scripts/local-supabase.mjs';
// Node 24 strips types; the module has no imports so it loads as-is.
import { brazilTimezones } from '../../src/features/establishments/domain/timezones.ts';

test('unidades pela API: lista curta de fusos aceita e colaborador negado', async (t) => {
  const { admin, client } = localSupabase();
  const org = randomUUID();
  const users = [];
  const clients = [];
  try {
    checked(
      await admin.from('organizations').insert({ id: org, name: 'Unidades' }),
    );
    for (const role of ['owner', 'member']) {
      const email = `unidades-${randomUUID()}@example.invalid`;
      const password = randomUUID();
      const { user } = checked(
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        }),
      );
      users.push(user.id);
      checked(
        await admin
          .from('memberships')
          .insert({ organization_id: org, user_id: user.id, role }),
      );
      const c = client();
      checked(await c.auth.signInWithPassword({ email, password }));
      clients.push(c);
    }
    const [owner, member] = clients;

    await t.test('cada fuso da lista é aceito pelo banco', async () => {
      const rows = checked(
        await owner
          .from('establishments')
          .insert(
            brazilTimezones.map((zone) => ({
              organization_id: org,
              name: `Unidade ${zone.id}`,
              timezone: zone.id,
            })),
          )
          .select('id,timezone'),
      );
      assert.deepEqual(
        rows.map((row) => row.timezone).sort(),
        brazilTimezones.map((zone) => zone.id).sort(),
      );
    });
    await t.test('colaborador não cria, renomeia nem altera fuso', async () => {
      assert.ok(
        (
          await member
            .from('establishments')
            .insert({ organization_id: org, name: 'Ataque', timezone: 'UTC' })
        ).error,
      );
      assert.equal(
        checked(
          await member
            .from('establishments')
            .update({ name: 'Ataque', timezone: 'UTC' })
            .eq('organization_id', org)
            .select('id'),
        ).length,
        0,
      );
      const units = checked(
        await admin
          .from('establishments')
          .select('name,timezone')
          .eq('organization_id', org),
      );
      assert.ok(
        units.every((u) => u.name !== 'Ataque' && u.timezone !== 'UTC'),
      );
    });
    await t.test(
      'recusa de fuso chega ao cliente com código 22023',
      async () => {
        const { error } = await owner
          .from('establishments')
          .insert({
            organization_id: org,
            name: 'Inválida',
            timezone: 'Mars/Base',
          })
          .select('id')
          .single();
        assert.equal(error?.code, '22023');
      },
    );
  } finally {
    // Physical cleanup is restricted to randomly generated disposable fixtures.
    checked(
      await admin.from('establishments').delete().eq('organization_id', org),
    );
    checked(
      await admin.from('memberships').delete().eq('organization_id', org),
    );
    checked(await admin.from('organizations').delete().eq('id', org));
    for (const id of users) checked(await admin.auth.admin.deleteUser(id));
    for (const c of clients) await c.auth.signOut({ scope: 'local' });
  }
});
