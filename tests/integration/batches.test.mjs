import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

test('recebimento de lote é atômico, idempotente e isolado', async () => {
  await withCatalogFixture(
    async ({ admin, client, users, scopeA, scopeA2, scopeB }) => {
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
          .insert({ ...scopeA, name: 'Produto lote', unit: 'kg' })
          .select('id')
          .single(),
      );
      const supplier = checked(
        await a
          .from('suppliers')
          .insert({ ...scopeA, name: 'Fornecedor lote' })
          .select('id')
          .single(),
      );
      const args = {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_product_id: product.id,
        p_supplier_id: supplier.id,
        p_source_code: '0001',
        p_quantity: '1.250',
        p_expiry_date: '2027-01-01',
        p_expiry_origin: 'original',
        p_original_expiry_date: '2027-01-01',
        p_intent_id: randomUUID(),
      };
      const results = await Promise.all([
        a.rpc('receive_batch', args),
        a.rpc('receive_batch', args),
      ]);
      const ids = results.map(checked);
      assert.equal(
        (
          await a.rpc('receive_batch', {
            ...args,
            p_intent_id: randomUUID(),
            p_original_expiry_date: null,
          })
        ).error?.code,
        '23514',
      );
      assert.equal(
        (
          await a.rpc('receive_batch', {
            ...args,
            p_intent_id: randomUUID(),
            p_expiry_date: 'infinity',
            p_original_expiry_date: 'infinity',
          })
        ).error?.code,
        '23514',
      );
      assert.equal(
        (
          await a.rpc('receive_batch', {
            ...args,
            p_intent_id: randomUUID(),
            p_source_code: '\t',
          })
        ).error?.code,
        '23514',
      );
      assert.equal(ids[0], ids[1]);
      const rows = checked(await a.from('batch_receipts').select());
      const named = checked(
        await a
          .from('batch_receipts')
          .select('id,products!inner(name)')
          .eq('id', ids[0]),
      );
      assert.equal(named[0].products.name, 'Produto lote');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].created_by, users[0].id);
      assert.equal(rows[0].unit, 'kg');
      assert.equal(rows[0].timezone, 'America/Sao_Paulo');
      const containerId = checked(
        await a.rpc('ensure_container', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_batch_id: ids[0],
        }),
      );
      const joined = checked(
        await a
          .from('batch_receipts')
          .select('id,containers(id)')
          .eq('organization_id', scopeA.organization_id)
          .eq('establishment_id', scopeA.establishment_id)
          .eq('id', ids[0])
          .single(),
      );
      const relatedContainer = Array.isArray(joined.containers)
        ? joined.containers[0]
        : joined.containers;
      assert.equal(relatedContainer?.id, containerId);
      assert.equal(
        (await a.rpc('receive_batch', { ...args, p_quantity: '2' })).error
          ?.code,
        '23505',
      );
      assert.equal(
        (
          await a.rpc('receive_batch', {
            ...args,
            p_intent_id: randomUUID(),
            p_quantity: '1.2345',
          })
        ).error?.code,
        '22023',
      );
      assert.ok(
        (
          await a.rpc('receive_batch', {
            ...args,
            p_intent_id: randomUUID(),
            p_establishment_id: scopeA2.establishment_id,
          })
        ).error,
      );
      assert.ok(
        (await b.rpc('receive_batch', { ...args, p_intent_id: randomUUID() }))
          .error,
      );
      assert.ok(
        (
          await member.rpc('receive_batch', {
            ...args,
            p_intent_id: randomUUID(),
          })
        ).error,
      );
      assert.deepEqual(checked(await b.from('batch_receipts').select()), []);
      assert.deepEqual(
        checked(await b.from('batch_receipts').select('id,containers(id)')),
        [],
      );
      assert.ok((await client().from('batch_receipts').select()).error);
      assert.ok(
        (
          await a
            .from('batch_receipts')
            .update({ quantity: 2 })
            .eq('id', ids[0])
        ).error,
      );
      assert.notEqual(
        checked(
          await a.rpc('receive_batch', { ...args, p_intent_id: randomUUID() }),
        ),
        ids[0],
      );
      checked(
        await admin
          .from('memberships')
          .update({ revoked_at: new Date().toISOString() })
          .eq('user_id', users[0].id),
      );
      assert.ok((await a.rpc('receive_batch', args)).error);
      assert.deepEqual(checked(await a.from('batch_receipts').select()), []);
      assert.deepEqual(
        checked(
          await b
            .from('batch_receipts')
            .select()
            .eq('organization_id', scopeB.organization_id),
        ),
        [],
      );
    },
  );
});
