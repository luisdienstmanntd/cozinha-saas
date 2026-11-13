// Fase 6, fatia 6.4: anulação de manipulação pela API com usuários reais (testes 19 com anulação e 24
// do desenho). Reenvio concorrente idêntico, anulação × baixa num derivado, anulação × anulação,
// revogação durante a sessão e isolamento entre empresas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

function unitDate(offsetDays) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

test('anulação de manipulação: concorrência, reenvio, revogação e isolamento pela API', async () => {
  await withCatalogFixture(async ({ admin, client, users, scopeA }) => {
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
        .insert({ ...scopeA, name: 'Queijo', unit: 'kg' })
        .select('id')
        .single(),
    );
    const supplier = checked(
      await a
        .from('suppliers')
        .insert({ ...scopeA, name: 'Laticínio' })
        .select('id')
        .single(),
    );
    const expiry = unitDate(10);
    const batchId = checked(
      await a.rpc('receive_batch', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_product_id: product.id,
        p_supplier_id: supplier.id,
        p_source_code: 'Q-' + randomUUID().slice(0, 8),
        p_quantity: 20,
        p_expiry_date: expiry,
        p_expiry_origin: 'original',
        p_original_expiry_date: expiry,
        p_storage_condition: 'ambient',
        p_temperature_status: 'not_required',
        p_received_temperature_c: null,
        p_temperature_reason: null,
        p_intent_id: randomUUID(),
      }),
    );
    const integral = checked(
      await a
        .from('containers')
        .select('id')
        .eq('batch_id', batchId)
        .eq('kind', 'integral')
        .single(),
    ).id;
    checked(
      await a.rpc('set_member_display_name', {
        p_organization_id: scopeA.organization_id,
        p_user_id: users[2].id,
        p_display_name: 'Bia',
      }),
    );
    const handle = async (overrides = {}) =>
      checked(
        await a.rpc('handle_container', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_source_container_id: integral,
          p_kind: 'portioning',
          p_quantities: [2, 2],
          p_expiry_date: unitDate(5),
          p_storage: 'refrigerated',
          p_handled_at: new Date().toISOString(),
          p_handled_by: users[2].id,
          p_remainder: 'sealed',
          p_remainder_reason: null,
          p_note: null,
          p_late_reason: null,
          p_intent_id: randomUUID(),
          ...overrides,
        }),
      );
    const voidArgs = (handlingId, overrides = {}) => ({
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_handling_id: handlingId,
      p_reason: 'Validade digitada errada',
      p_intent_id: randomUUID(),
      ...overrides,
    });
    const balanceOf = async (id) =>
      checked(
        await a
          .from('container_balances')
          .select('balance')
          .eq('container_id', id)
          .single(),
      ).balance;
    const derivedOf = async (handlingId) =>
      checked(
        await a
          .from('containers')
          .select('id')
          .eq('handling_id', handlingId)
          .order('position'),
      ).map((c) => c.id);

    // Teste 19 (anulação): cinco reenvios concorrentes idênticos: uma anulação, um conjunto de eventos.
    const h1 = await handle();
    const args1 = voidArgs(h1);
    const repeats = await Promise.all(
      Array.from({ length: 5 }, () => a.rpc('void_handling', args1)),
    );
    const voidIds = repeats.map(checked);
    assert.equal(new Set(voidIds).size, 1, 'mesmo ID para os cinco envios');
    assert.equal(
      checked(await a.from('handling_voids').select('id').eq('handling_id', h1))
        .length,
      1,
    );
    const events = checked(
      await a
        .from('stock_movements')
        .select('kind,quantity')
        .eq('handling_void_id', voidIds[0])
        .order('kind'),
    );
    assert.deepEqual(
      events.map((e) => `${e.kind}:${e.quantity}`),
      ['handling_void:2', 'handling_void:2', 'transfer_reversal:4'],
    );
    assert.equal(await balanceOf(integral), 20);
    for (const id of await derivedOf(h1)) assert.equal(await balanceOf(id), 0);

    // Anulações concorrentes diferentes da mesma manipulação: só uma passa.
    const h2 = await handle();
    const pairVoid = await Promise.all([
      a.rpc('void_handling', voidArgs(h2)),
      a.rpc('void_handling', voidArgs(h2, { p_reason: 'Outro motivo' })),
    ]);
    assert.equal(pairVoid.filter((x) => !x.error).length, 1);
    assert.equal(pairVoid.filter((x) => x.error?.code === '23505').length, 1);
    assert.equal(await balanceOf(integral), 20);

    // Teste 24: anulação × baixa num derivado, várias rodadas. Ou a baixa entra e a anulação é recusada,
    // ou a anulação entra e a baixa é recusada (sem saldo); nunca as duas, saldo nunca negativo.
    for (let round = 0; round < 4; round += 1) {
      const h = await handle();
      const [first] = await derivedOf(h);
      const pair = await Promise.all([
        a.rpc('void_handling', voidArgs(h)),
        a.rpc('record_container_movement', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_container_id: first,
          p_kind: 'consumption',
          p_quantity: 1,
          p_reason: null,
          p_intent_id: randomUUID(),
        }),
      ]);
      assert.equal(pair.filter((x) => !x.error).length, 1, `rodada ${round}`);
      assert.equal(pair.filter((x) => x.error?.code === '22023').length, 1);
      const voided = !pair[0].error;
      assert.equal(await balanceOf(first), voided ? 0 : 1);
      assert.ok((await balanceOf(integral)) >= 0);
    }

    // Leitura e isolamento: membro lê a anulação; outra empresa não vê nada e não anula.
    const seen = checked(
      await member
        .from('handling_voids')
        .select('id,reason,created_by')
        .eq('id', voidIds[0])
        .single(),
    );
    assert.equal(seen.reason, 'Validade digitada errada');
    assert.equal(seen.created_by, users[0].id);
    assert.deepEqual(checked(await b.from('handling_voids').select('id')), []);
    const h3 = await handle();
    assert.equal(
      (await b.rpc('void_handling', voidArgs(h3))).error?.code,
      '42501',
      'proprietário de outra empresa não anula em A',
    );
    assert.equal(
      (await member.rpc('void_handling', voidArgs(h3))).error?.code,
      '42501',
      'membro não anula (D-019)',
    );
    const direct = await a
      .from('handling_voids')
      .insert({ ...scopeA, batch_id: batchId, handling_id: h3, reason: 'x' });
    assert.equal(direct.error?.code, '42501', 'nada é gravado direto pela API');

    // Revogação durante a sessão: a próxima anulação com o token anterior é negada.
    checked(
      await admin
        .from('memberships')
        .update({ revoked_at: new Date().toISOString() })
        .eq('organization_id', scopeA.organization_id)
        .eq('user_id', users[0].id),
    );
    assert.equal(
      (await a.rpc('void_handling', voidArgs(h3))).error?.code,
      '42501',
    );
    assert.equal(
      (await a.rpc('void_handling', args1)).error?.code,
      '42501',
      'replay também é reautorizado',
    );
    assert.equal(
      checked(
        await member.from('handling_voids').select('id').eq('handling_id', h3),
      ).length,
      0,
    );
  });
});
