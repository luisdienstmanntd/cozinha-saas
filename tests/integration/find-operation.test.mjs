// Fase 6, fatia 6.8: conferência de tentativa pendente pela API com usuários reais. O proprietário e
// o membro da empresa veem a operação gravada; outra empresa e anônimo não veem nada; identificador
// desconhecido não encontra nada; a mesma tentativa repetida não grava duas vezes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

test('find_operation: confere a operação gravada, sem vazar para outra empresa', async () => {
  await withCatalogFixture(async ({ client, users, scopeA }) => {
    const a = client(),
      b = client(),
      member = client(),
      anon = client();
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
    const ids = {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
    };
    const product = checked(
      await a
        .from('products')
        .insert({ ...scopeA, name: 'Arroz', unit: 'kg' })
        .select('id')
        .single(),
    );
    checked(
      await a.rpc('set_product_storage_condition', {
        ...ids,
        p_product_id: product.id,
        p_storage_condition: 'ambient',
      }),
    );
    const supplier = checked(
      await a
        .from('suppliers')
        .insert({ ...scopeA, name: 'Horta' })
        .select('id')
        .single(),
    );
    const intent = randomUUID();
    const receive = () =>
      a.rpc('receive_batch', {
        ...ids,
        p_product_id: product.id,
        p_supplier_id: supplier.id,
        p_source_code: 'H-1',
        p_quantity: 10,
        p_expiry_date: '2030-01-01',
        p_expiry_origin: 'original',
        p_original_expiry_date: '2030-01-01',
        p_storage_condition: 'ambient',
        p_temperature_status: 'not_required',
        p_received_temperature_c: null,
        p_temperature_reason: null,
        p_intent_id: intent,
      });
    const find = (c, id, scope = ids) =>
      c.rpc('find_operation', { ...scope, p_intent_id: id });
    assert.deepEqual(
      checked(await find(a, intent)),
      [],
      'antes de gravar não há nada',
    );
    const batch = checked(await receive());
    const found = checked(await find(a, intent));
    assert.equal(found.length, 1);
    assert.equal(found[0].kind, 'receipt');
    assert.equal(found[0].id, batch);
    assert.deepEqual(
      checked(await find(member, intent)),
      found,
      'membro vê o mesmo',
    );
    assert.deepEqual(
      checked(await find(b, intent)),
      [],
      'outra empresa não vê',
    );
    assert.deepEqual(
      checked(await find(a, randomUUID())),
      [],
      'identificador desconhecido',
    );
    assert.ok((await find(anon, intent)).error, 'anônimo não confere');
    // Repetir a mesma tentativa devolve o mesmo recebimento e não duplica.
    assert.equal(checked(await receive()), batch);
    const rows = checked(
      await a
        .from('batch_receipts')
        .select('id')
        .eq('organization_id', scopeA.organization_id)
        .eq('intent_id', intent),
    );
    assert.equal(rows.length, 1);
  });
});
