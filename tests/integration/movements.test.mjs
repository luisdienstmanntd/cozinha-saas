import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

test('baixas concorrentes são atômicas, idempotentes e isoladas', async () => {
  await withCatalogFixture(
    async ({ admin, client, users, scopeA, scopeA2 }) => {
      const a = client(),
        b = client(),
        member = client();
      for (const [c, u] of [
        [a, users[0]],
        [b, users[1]],
        [member, users[2]],
      ])
        checked(
          await c.auth.signInWithPassword({
            email: u.email,
            password: u.password,
          }),
        );
      const product = checked(
        await a
          .from('products')
          .insert({ ...scopeA, name: 'Produto', unit: 'kg' })
          .select('id')
          .single(),
      );
      const supplier = checked(
        await a
          .from('suppliers')
          .insert({ ...scopeA, name: 'Fornecedor' })
          .select('id')
          .single(),
      );
      const batch = checked(
        await a.rpc('receive_batch', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_product_id: product.id,
          p_supplier_id: supplier.id,
          p_source_code: 'L1',
          p_quantity: 1,
          p_expiry_date: '2027-01-01',
          p_expiry_origin: 'original',
          p_original_expiry_date: '2027-01-01',
          p_intent_id: randomUUID(),
        }),
      );
      const args = {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_batch_id: batch,
        p_kind: 'consumption',
        p_quantity: 0.75,
        p_reason: null,
        p_intent_id: randomUUID(),
      };
      const results = await Promise.all([
        a.rpc('record_movement', args),
        a.rpc('record_movement', { ...args, p_intent_id: randomUUID() }),
      ]);
      assert.equal(results.filter((x) => !x.error).length, 1);
      assert.equal(results.filter((x) => x.error?.code === '22023').length, 1);
      const winner = results[0].error ? { ...args, p_intent_id: null } : args;
      const events = checked(await a.from('stock_movements').select());
      assert.equal(events.length, 1);
      winner.p_intent_id = events[0].intent_id;
      assert.equal(
        checked(await a.rpc('record_movement', winner)),
        events[0].id,
      );
      assert.equal(
        (await a.rpc('record_movement', { ...winner, p_quantity: 0.5 })).error
          ?.code,
        '23505',
      );
      const final = {
        ...args,
        p_kind: 'discard',
        p_quantity: 0.25,
        p_reason: 'dano',
        p_intent_id: randomUUID(),
      };
      const repeat = await Promise.all([
        a.rpc('record_movement', final),
        a.rpc('record_movement', final),
      ]);
      assert.equal(checked(repeat[0]), checked(repeat[1]));
      assert.equal(checked(await a.from('stock_movements').select()).length, 2);
      assert.ok(
        (
          await member.rpc('record_movement', {
            ...args,
            p_intent_id: randomUUID(),
          })
        ).error,
      );
      assert.ok((await b.rpc('record_movement', winner)).error);
      assert.ok(
        (
          await a.rpc('record_movement', {
            ...args,
            p_establishment_id: scopeA2.establishment_id,
            p_intent_id: randomUUID(),
          })
        ).error,
      );
      assert.deepEqual(checked(await b.from('stock_movements').select()), []);
      assert.equal(
        checked(await member.from('stock_movements').select()).length,
        2,
      );
      assert.ok(
        (await a.from('stock_movements').delete().eq('id', events[0].id)).error,
      );
      checked(
        await admin
          .from('memberships')
          .update({ revoked_at: new Date().toISOString() })
          .eq('user_id', users[0].id),
      );
      assert.ok((await a.rpc('record_movement', winner)).error);
      assert.deepEqual(checked(await a.from('stock_movements').select()), []);
    },
  );
});
