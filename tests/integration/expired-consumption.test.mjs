// Fase 6, fatia 6.11: pela API real, o consumo de recipiente vencido é recusado com a mensagem do
// banco, o descarte passa e a métrica de vencidos com saldo respeita a RLS. Dados sintéticos; a data
// de "ontem" é calculada no fuso da unidade (America/Sao_Paulo), nunca em UTC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

function localDate(timezone, offsetDays) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const value = new Date(`${today}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

test('consumo de vencido recusado pela API, descarte permitido e métrica pela RLS', async () => {
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
    const product = checked(
      await owner
        .from('products')
        .insert({ ...scopeA, name: 'Arroz', unit: 'kg' })
        .select('id')
        .single(),
    );
    checked(
      await owner.rpc('set_product_storage_condition', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_product_id: product.id,
        p_storage_condition: 'ambient',
      }),
    );
    const supplier = checked(
      await owner
        .from('suppliers')
        .insert({ ...scopeA, name: 'Fornecedor' })
        .select('id')
        .single(),
    );
    const yesterday = localDate('America/Sao_Paulo', -1);
    const batch = checked(
      await owner.rpc('receive_batch', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_product_id: product.id,
        p_supplier_id: supplier.id,
        p_source_code: 'V1',
        p_quantity: 3,
        p_expiry_date: yesterday,
        p_expiry_origin: 'original',
        p_original_expiry_date: yesterday,
        p_storage_condition: 'ambient',
        p_temperature_status: 'not_required',
        p_received_temperature_c: null,
        p_temperature_reason: null,
        p_intent_id: randomUUID(),
      }),
    );
    const container = checked(
      await owner.rpc('ensure_container', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_batch_id: batch,
      }),
    );
    const [y, m, d] = yesterday.split('-');
    const message = `Recipiente vencido: a validade registrada (${d}/${m}/${y}) já passou na data da unidade. Consumo recusado; o descarte continua permitido.`;
    const exit = (kind, quantity, reason) =>
      owner.rpc('record_container_movement', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_container_id: container,
        p_kind: kind,
        p_quantity: quantity,
        p_reason: reason,
        p_intent_id: randomUUID(),
      });
    const refused = await exit('consumption', 1, null);
    assert.equal(refused.error?.code, '22023');
    assert.equal(refused.error?.message, message);
    const legacy = await owner.rpc('record_movement', {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_batch_id: batch,
      p_kind: 'consumption',
      p_quantity: 1,
      p_reason: null,
      p_intent_id: randomUUID(),
    });
    assert.equal(legacy.error?.message, message);
    assert.deepEqual(
      checked(
        await owner
          .from('stock_movements')
          .select('id')
          .eq('container_id', container),
      ),
      [],
    );

    const metrics = async (c, scope) =>
      checked(
        await c.rpc('pilot_metrics', {
          p_organization_id: scope.organization_id,
          p_establishment_id: scope.establishment_id,
          p_from: new Date(Date.now() - 86400000).toISOString(),
          p_to: new Date(Date.now() + 86400000).toISOString(),
        }),
      )[0];
    assert.equal(
      Number((await metrics(owner, scopeA)).containers_expired_with_balance),
      1,
    );
    assert.equal(
      Number((await metrics(member, scopeA)).containers_expired_with_balance),
      1,
    );
    assert.equal(
      Number((await metrics(other, scopeA)).containers_expired_with_balance),
      0,
    );
    assert.equal(
      Number((await metrics(other, scopeB)).containers_expired_with_balance),
      0,
    );

    checked(await exit('discard', 3, 'Validade passou'));
    assert.equal(
      Number((await metrics(owner, scopeA)).containers_expired_with_balance),
      0,
    );
  });
});
