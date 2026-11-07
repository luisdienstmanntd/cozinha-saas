import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

test('recipiente integral é único e isolado entre empresas', async () => {
  await withCatalogFixture(async ({ admin, client, users, scopeA, scopeB }) => {
    const a = client(),
      b = client(),
      member = client();
    checked(
      await a.auth.signInWithPassword({
        email: users[0].email,
        password: users[0].password,
      }),
    );
    checked(
      await b.auth.signInWithPassword({
        email: users[1].email,
        password: users[1].password,
      }),
    );
    checked(
      await member.auth.signInWithPassword({
        email: users[2].email,
        password: users[2].password,
      }),
    );
    const product = checked(
      await a
        .from('products')
        .insert({ ...scopeA, name: 'Arroz', unit: 'kg' })
        .select('id')
        .single(),
    );
    const supplier = checked(
      await a
        .from('suppliers')
        .insert({ ...scopeA, name: 'Horta' })
        .select('id')
        .single(),
    );
    const batch = checked(
      await a.rpc('receive_batch', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_product_id: product.id,
        p_supplier_id: supplier.id,
        p_source_code: '0001',
        p_quantity: 1.25,
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
    };
    const responses = await Promise.all([
      a.rpc('ensure_container', args),
      a.rpc('ensure_container', args),
    ]);
    const ids = responses.map(checked);
    assert.equal(ids[0], ids[1]);
    assert.equal(checked(await a.from('containers').select()).length, 1);
    assert.equal(checked(await member.from('containers').select()).length, 1);
    assert.equal(
      (await member.rpc('ensure_container', args)).error?.code,
      '42501',
    );
    assert.deepEqual(
      checked(await b.from('containers').select().eq('id', ids[0])),
      [],
    );
    assert.ok((await b.rpc('ensure_container', args)).error);
    assert.ok((await client().from('containers').select()).error);
    assert.ok((await a.from('containers').delete().eq('id', ids[0])).error);
    assert.equal(checked(await a.rpc('ensure_container', args)), ids[0]);
    const rows = checked(await a.from('batch_receipts').select('id,quantity'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].quantity, 1.25);
    assert.ok(
      (
        await a.rpc('ensure_container', {
          ...args,
          p_establishment_id: scopeB.establishment_id,
        })
      ).error,
    );
    checked(
      await admin
        .from('memberships')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', users[0].id),
    );
    assert.ok((await a.rpc('ensure_container', args)).error);
    assert.deepEqual(
      checked(await a.from('containers').select().eq('id', ids[0])),
      [],
    );
  });
});
