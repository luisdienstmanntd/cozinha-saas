import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

test('catálogo via API: permissões e pares de organização/unidade', async () => {
  await withCatalogFixture(
    async ({ admin, client, users, scopeA, scopeA2, scopeB }) => {
      const sessions = [];
      for (const { email, password } of users) {
        const session = client();
        checked(await session.auth.signInWithPassword({ email, password }));
        sessions.push(session);
      }
      const [ownerA, ownerB, memberA] = sessions;
      for (const table of ['products', 'suppliers']) {
        const row = {
          name: 'Exemplo',
          ...(table === 'products' ? { unit: 'kg' } : {}),
        };
        const { id: idA } = checked(
          await ownerA
            .from(table)
            .insert({ ...scopeA, ...row })
            .select('id')
            .single(),
        );
        const { id: idB } = checked(
          await ownerB
            .from(table)
            .insert({ ...scopeB, ...row })
            .select('id')
            .single(),
        );
        assert.deepEqual(
          checked(await ownerA.from(table).select('id').eq('id', idB)),
          [],
        );
        assert.deepEqual(
          checked(await ownerB.from(table).select('id').eq('id', idA)),
          [],
        );
        assert.deepEqual(
          checked(await ownerA.from(table).select('id').match(scopeA2)),
          [],
        );
        checked(await ownerA.from(table).insert({ ...scopeA2, ...row }));
        const { data: ownRows } = await ownerA
          .from(table)
          .select('id,establishments!inner(id)')
          .match(scopeA)
          .throwOnError();
        assert.deepEqual(ownRows, [
          { id: idA, establishments: { id: scopeA.establishment_id } },
        ]);
        assert.equal(
          (await ownerA.from(table).insert({ ...scopeB, ...row })).error?.code,
          '42501',
        );
        assert.equal(
          (
            await ownerA.from(table).insert({
              ...scopeA,
              establishment_id: scopeB.establishment_id,
              ...row,
            })
          ).error?.code,
          '23503',
        );
        assert.equal(
          (
            await ownerA.from(table).insert({
              ...scopeB,
              establishment_id: scopeA.establishment_id,
              ...row,
            })
          ).error?.code,
          '42501',
        );
        assert.equal(
          (
            await ownerA
              .from(table)
              .insert({ ...scopeA, ...row, name: 'EXEMPLO' })
          ).error?.code,
          '23505',
        );
        assert.equal(
          (
            await ownerA
              .from(table)
              .insert({ ...scopeA, ...row, name: '\tExemplo\u00a0' })
          ).error?.code,
          '23514',
        );
        assert.equal(
          (
            await memberA
              .from(table)
              .insert({ ...scopeA, ...row, name: 'Proibido' })
          ).error?.code,
          '42501',
        );
        assert.deepEqual(
          checked(await memberA.from(table).select('id').match(scopeA)),
          [{ id: idA }],
        );
        assert.equal(
          (await ownerA.from(table).update({ name: 'Mudança' }).eq('id', idA))
            .error?.code,
          '42501',
        );
        assert.equal(
          (await ownerA.from(table).delete().eq('id', idA)).error?.code,
          '42501',
        );
        assert.equal(
          (await client().from(table).select('id')).error?.code,
          '42501',
        );
      }
      const { session } = checked(await ownerA.auth.getSession());
      checked(
        await admin
          .from('memberships')
          .update({ revoked_at: new Date().toISOString() })
          .eq('user_id', users[0].id),
      );
      for (const table of ['products', 'suppliers']) {
        assert.deepEqual(checked(await ownerA.from(table).select('id')), []);
        const insert = {
          ...scopeA,
          name: 'Revogado',
          ...(table === 'products' ? { unit: 'kg' } : {}),
        };
        assert.equal(
          (await ownerA.from(table).insert(insert)).error?.code,
          '42501',
        );
        assert.equal(
          checked(
            await admin
              .from(table)
              .select('id')
              .in('organization_id', [
                scopeA.organization_id,
                scopeB.organization_id,
              ]),
          ).length,
          3,
        );
      }
      assert.equal(
        checked(await ownerA.auth.getSession()).session?.access_token ===
          session?.access_token,
        true,
      );
    },
  );
});
