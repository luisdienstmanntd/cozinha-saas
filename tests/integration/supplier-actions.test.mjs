import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

test('fornecedores: edição, exclusão, histórico e autorização pela API', async () => {
  await withCatalogFixture(async ({ client, users, scopeA, scopeB }) => {
    const owner = client(),
      other = client(),
      member = client();
    for (const [c, u] of [
      [owner, users[0]],
      [other, users[1]],
      [member, users[2]],
    ])
      checked(
        await c.auth.signInWithPassword({
          email: u.email,
          password: u.password,
        }),
      );
    const s = checked(
      await owner
        .from('suppliers')
        .insert({
          ...scopeA,
          name: 'Horta',
          email: 'a@example.test',
          contact: '0011',
        })
        .select('id')
        .single(),
    );
    const args = {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_supplier_id: s.id,
    };
    const edit = {
      ...args,
      p_name: 'Nova Horta',
      p_email: 'b@example.test',
      p_contact: '0022',
    };
    assert.equal(
      checked(await owner.rpc('edit_supplier', edit)).name,
      'Nova Horta',
    );
    assert.equal((await other.rpc('edit_supplier', edit)).error?.code, '42501');
    assert.equal(
      (await member.rpc('delete_supplier', args)).error?.code,
      '42501',
    );
    assert.equal(
      (
        await owner.rpc('delete_supplier', {
          ...args,
          p_organization_id: scopeB.organization_id,
        })
      ).error?.code,
      '42501',
    );
    const product = checked(
      await owner
        .from('products')
        .insert({ ...scopeA, name: 'Arroz', unit: 'kg' })
        .select('id')
        .single(),
    );
    const scope = {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
    };
    checked(
      await owner.rpc('set_product_storage_condition', {
        ...scope,
        p_product_id: product.id,
        p_storage_condition: 'ambient',
      }),
    );
    checked(
      await owner.rpc('receive_batch', {
        ...scope,
        p_product_id: product.id,
        p_supplier_id: s.id,
        p_source_code: 'FORN1',
        p_quantity: 1,
        p_expiry_date: '2027-01-01',
        p_expiry_origin: 'original',
        p_original_expiry_date: '2027-01-01',
        p_storage_condition: 'ambient',
        p_temperature_status: 'not_required',
        p_received_temperature_c: null,
        p_temperature_reason: null,
        p_intent_id: randomUUID(),
      }),
    );
    assert.equal(
      (await owner.rpc('delete_supplier', args)).error?.code,
      '23503',
    );
    assert.equal(
      (await owner.rpc('edit_supplier', { ...edit, p_name: 'Outra Horta' }))
        .error?.code,
      '22023',
    );
    const saved = checked(
      await owner.rpc('edit_supplier', {
        ...edit,
        p_email: null,
        p_contact: '0033',
      }),
    );
    assert.equal(saved.contact, '0033');
    assert.equal(saved.email, null);
    const unused = checked(
      await owner
        .from('suppliers')
        .insert({ ...scopeA, name: 'Sem uso' })
        .select('id')
        .single(),
    );
    checked(
      await owner.rpc('delete_supplier', { ...args, p_supplier_id: unused.id }),
    );
    assert.deepEqual(
      checked(await owner.from('suppliers').select('id').eq('id', unused.id)),
      [],
    );
    const audit = checked(
      await owner
        .from('entity_changes')
        .select('old_value,changed_by')
        .eq('entity_id', unused.id)
        .eq('field', 'deleted')
        .single(),
    );
    assert.equal(JSON.parse(audit.old_value).name, 'Sem uso');
    assert.equal(audit.changed_by, users[0].id);
  });
});
