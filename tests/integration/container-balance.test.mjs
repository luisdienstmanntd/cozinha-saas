// Fase 6, fatia 6.1: recipiente integral criado com o recebimento, código curto sem repetição sob
// concorrência (teste 23 do desenho) e saldo por recipiente atômico entre as duas assinaturas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

test('saldo por recipiente: integral no recebimento, código curto único e baixas atômicas', async () => {
  await withCatalogFixture(async ({ client, users, scopeA, scopeA2 }) => {
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
        .insert({ ...scopeA, name: 'Feijão', unit: 'kg' })
        .select('id')
        .single(),
    );
    const supplier = checked(
      await a
        .from('suppliers')
        .insert({ ...scopeA, name: 'Atacado' })
        .select('id')
        .single(),
    );
    const receipt = (intent, quantity = 1) => ({
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_product_id: product.id,
      p_supplier_id: supplier.id,
      p_source_code: 'L-' + intent.slice(0, 8),
      p_quantity: quantity,
      p_expiry_date: '2030-03-01',
      p_expiry_origin: 'original',
      p_original_expiry_date: '2030-03-01',
      p_storage_condition: 'ambient',
      p_temperature_status: 'not_required',
      p_received_temperature_c: null,
      p_temperature_reason: null,
      p_intent_id: intent,
    });

    // 12 recebimentos concorrentes, e cada um reenviado ao mesmo tempo.
    const intents = Array.from({ length: 12 }, () => randomUUID());
    const responses = await Promise.all(
      intents.flatMap((i) => [
        a.rpc('receive_batch', receipt(i)),
        a.rpc('receive_batch', receipt(i)),
      ]),
    );
    const ids = responses.map(checked);
    for (let i = 0; i < ids.length; i += 2) assert.equal(ids[i], ids[i + 1]);
    const batchIds = [...new Set(ids)];
    assert.equal(batchIds.length, 12);

    const containers = checked(
      await a
        .from('containers')
        .select(
          'id,batch_id,kind,parent_container_id,initial_quantity,expiry_date,expiry_origin,short_code,timezone',
        )
        .eq('organization_id', scopeA.organization_id),
    );
    assert.equal(containers.length, 12, 'um integral por recebimento');
    assert.deepEqual(
      [...new Set(containers.map((c) => c.batch_id))].sort(),
      [...batchIds].sort(),
    );
    for (const c of containers) {
      assert.equal(c.kind, 'integral');
      assert.equal(c.parent_container_id, null);
      assert.equal(c.initial_quantity, 1);
      assert.equal(c.expiry_date, '2030-03-01');
      assert.equal(c.expiry_origin, 'receipt');
      assert.equal(c.timezone, 'America/Sao_Paulo');
      assert.match(c.short_code, /^C-[0-9]{6,}$/);
    }
    assert.equal(
      new Set(containers.map((c) => c.short_code)).size,
      12,
      'códigos curtos sem repetição sob concorrência',
    );
    assert.equal(
      checked(await member.from('containers').select('short_code')).length,
      12,
    );
    assert.deepEqual(checked(await b.from('containers').select('id')), []);

    // ensure_container devolve o integral criado pelo recebimento.
    const first = containers.find((c) => c.batch_id === batchIds[0]);
    assert.equal(
      checked(
        await a.rpc('ensure_container', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_batch_id: batchIds[0],
        }),
      ),
      first.id,
    );

    // Baixas concorrentes pela assinatura nova e pela antiga no mesmo integral: só uma cabe no saldo.
    const byContainer = {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_container_id: first.id,
      p_kind: 'consumption',
      p_quantity: 0.75,
      p_reason: null,
      p_intent_id: randomUUID(),
    };
    const byBatch = {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_batch_id: batchIds[0],
      p_kind: 'consumption',
      p_quantity: 0.75,
      p_reason: null,
      p_intent_id: randomUUID(),
    };
    const race = await Promise.all([
      a.rpc('record_container_movement', byContainer),
      a.rpc('record_movement', byBatch),
    ]);
    assert.equal(race.filter((x) => !x.error).length, 1);
    assert.equal(race.filter((x) => x.error?.code === '22023').length, 1);
    const events = checked(
      await a
        .from('stock_movements')
        .select('id,container_id,quantity')
        .eq('batch_id', batchIds[0]),
    );
    assert.equal(events.length, 1);
    assert.equal(events[0].container_id, first.id);

    // Reenvio concorrente idêntico pela assinatura nova: um único registro.
    const discard = {
      ...byContainer,
      p_kind: 'discard',
      p_quantity: 0.25,
      p_reason: 'embalagem danificada',
      p_intent_id: randomUUID(),
    };
    const repeat = await Promise.all([
      a.rpc('record_container_movement', discard),
      a.rpc('record_container_movement', discard),
    ]);
    assert.equal(checked(repeat[0]), checked(repeat[1]));
    assert.equal(
      (
        await a.rpc('record_container_movement', {
          ...discard,
          p_intent_id: randomUUID(),
        })
      ).error?.code,
      '22023',
      'saldo zerado',
    );

    // Consultas que a interface faz (supabaseBatches e supabaseMovements): filtro pelo integral.
    const listed = checked(
      await a
        .from('batch_receipts')
        .select('id,containers(id)')
        .eq('organization_id', scopeA.organization_id)
        .eq('id', batchIds[0])
        .eq('containers.kind', 'integral'),
    );
    const embedded = Array.isArray(listed[0].containers)
      ? listed[0].containers
      : [listed[0].containers];
    assert.deepEqual(embedded, [{ id: first.id }]);
    const history = checked(
      await a
        .from('stock_movements')
        .select('id,kind,containers!inner(kind)')
        .eq('organization_id', scopeA.organization_id)
        .eq('batch_id', batchIds[0])
        .eq('containers.kind', 'integral'),
    );
    assert.equal(history.length, 2);

    // Negações via API.
    assert.equal(
      (
        await member.rpc('record_container_movement', {
          ...byContainer,
          p_intent_id: randomUUID(),
        })
      ).error?.code,
      '42501',
    );
    assert.equal(
      (
        await b.rpc('record_container_movement', {
          ...byContainer,
          p_intent_id: randomUUID(),
        })
      ).error?.code,
      '42501',
    );
    assert.equal(
      (
        await a.rpc('record_container_movement', {
          ...byContainer,
          p_establishment_id: scopeA2.establishment_id,
          p_intent_id: randomUUID(),
        })
      ).error?.code,
      '23503',
    );
    assert.ok(
      (await client().rpc('record_container_movement', byContainer)).error,
    );
    assert.ok(
      (
        await a
          .from('containers')
          .update({ initial_quantity: 5 })
          .eq('id', first.id)
      ).error,
    );
  });
});
