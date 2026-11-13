// Fase 6, fatia 6.3: manipulação pela API com usuários reais (testes 17, 18, 19 e 20 do desenho).
// Concorrência no mesmo recipiente, reenvio concorrente idêntico, revogação durante a sessão e
// isolamento entre empresas.
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

test('manipulação: concorrência, reenvio, revogação e isolamento pela API', async () => {
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
        p_quantity: 10,
        p_expiry_date: expiry,
        p_expiry_origin: 'original',
        p_original_expiry_date: expiry,
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

    // Quem manipula precisa de nome de exibição, definido pelo proprietário.
    const handling = (overrides = {}) => ({
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_source_container_id: integral,
      p_kind: 'opening',
      p_quantities: [6],
      p_expiry_date: unitDate(5),
      p_storage: 'refrigerated',
      // Hora real da manipulação: agora (o recebimento acabou de ser registrado).
      p_handled_at: new Date().toISOString(),
      p_handled_by: users[2].id,
      p_remainder: 'sealed',
      p_remainder_reason: null,
      p_note: null,
      p_late_reason: null,
      p_intent_id: randomUUID(),
      ...overrides,
    });
    assert.equal(
      (await a.rpc('handle_container', handling())).error?.code,
      '22023',
      'sem nome de exibição, recusado',
    );
    assert.equal(
      (
        await member.rpc('set_member_display_name', {
          p_organization_id: scopeA.organization_id,
          p_user_id: users[2].id,
          p_display_name: 'Bia',
        })
      ).error?.code,
      '42501',
      'membro não define nome',
    );
    assert.equal(
      checked(
        await a.rpc('set_member_display_name', {
          p_organization_id: scopeA.organization_id,
          p_user_id: users[2].id,
          p_display_name: '  Bia  ',
        }),
      ),
      'Bia',
    );

    // Teste 17: duas manipulações concorrentes acima do saldo: só uma passa.
    const race = await Promise.all([
      a.rpc('handle_container', handling()),
      a.rpc('handle_container', handling()),
    ]);
    assert.equal(race.filter((x) => !x.error).length, 1);
    assert.equal(race.filter((x) => x.error?.code === '22023').length, 1);
    const balanceOf = async (id) =>
      checked(
        await a
          .from('container_balances')
          .select('balance')
          .eq('container_id', id)
          .single(),
      ).balance;
    assert.equal(await balanceOf(integral), 4);

    // Teste 18: manipulação × baixa na mesma origem (4 kg): só uma de 3 kg cabe; saldo nunca negativo.
    for (let round = 0; round < 2; round += 1) {
      const pair = await Promise.all([
        a.rpc('handle_container', handling({ p_quantities: [3] })),
        a.rpc('record_container_movement', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_container_id: integral,
          p_kind: 'consumption',
          p_quantity: 3,
          p_reason: null,
          p_intent_id: randomUUID(),
        }),
      ]);
      if (round === 0) {
        assert.equal(pair.filter((x) => !x.error).length, 1);
        assert.equal(pair.filter((x) => x.error?.code === '22023').length, 1);
      } else {
        assert.equal(
          pair.filter((x) => x.error?.code === '22023').length,
          2,
          'com 1 kg, nenhuma das duas cabe',
        );
      }
      assert.ok((await balanceOf(integral)) >= 0);
    }
    assert.equal(await balanceOf(integral), 1);

    // Teste 19: reenvio concorrente idêntico: um único registro (porcionamento com sobra como porção).
    const derivedId = checked(
      await a
        .from('containers')
        .select('id,initial_quantity')
        .eq('batch_id', batchId)
        .eq('kind', 'derived')
        .eq('initial_quantity', 6)
        .single(),
    ).id;
    const portions = handling({
      p_source_container_id: derivedId,
      p_kind: 'portioning',
      p_quantities: [2, 2],
      p_remainder: 'portion',
      p_note: 'Porções para o almoço',
    });
    const repeats = await Promise.all(
      Array.from({ length: 5 }, () => a.rpc('handle_container', portions)),
    );
    const handlingIds = repeats.map(checked);
    assert.equal(new Set(handlingIds).size, 1, 'mesmo ID para os cinco envios');
    const handlingId = handlingIds[0];
    assert.equal(
      checked(
        await a
          .from('container_handlings')
          .select('id')
          .eq('intent_id', portions.p_intent_id),
      ).length,
      1,
    );
    const children = checked(
      await a
        .from('containers')
        .select('position,initial_quantity,parent_container_id,short_code')
        .eq('handling_id', handlingId)
        .order('position'),
    );
    assert.deepEqual(
      children.map((c) => [c.position, c.initial_quantity]),
      [
        [1, 2],
        [2, 2],
        [3, 2],
      ],
    );
    assert.ok(children.every((c) => c.parent_container_id === derivedId));
    assert.equal(new Set(children.map((c) => c.short_code)).size, 3);
    const transfers = checked(
      await a
        .from('stock_movements')
        .select('kind,quantity,container_id,intent_id')
        .eq('handling_id', handlingId),
    );
    assert.deepEqual(transfers, [
      {
        kind: 'transfer',
        quantity: 6,
        container_id: derivedId,
        intent_id: portions.p_intent_id,
      },
    ]);
    assert.equal(await balanceOf(derivedId), 0);
    assert.equal(
      (
        await a.rpc('handle_container', {
          ...portions,
          p_quantities: [2, 1],
        })
      ).error?.code,
      '23505',
      'mesmo identificador com outros dados',
    );
    assert.equal(
      (
        await a.rpc('record_container_movement', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_container_id: integral,
          p_kind: 'consumption',
          p_quantity: 0.5,
          p_reason: null,
          p_intent_id: portions.p_intent_id,
        })
      ).error?.code,
      '23505',
      'baixa não reaproveita o identificador de uma manipulação',
    );

    // Leitura: membro vê manipulação, nome copiado e derivados; outra empresa não vê nada.
    const seen = checked(
      await member
        .from('container_handlings')
        .select('id,handled_by_name,created_by,kind')
        .eq('id', handlingId)
        .single(),
    );
    assert.equal(seen.handled_by_name, 'Bia');
    assert.equal(seen.created_by, users[0].id);
    assert.deepEqual(
      checked(await b.from('container_handlings').select('id')),
      [],
    );
    assert.equal(
      (await b.rpc('handle_container', handling())).error?.code,
      '42501',
      'proprietário de outra empresa não manipula em A',
    );
    assert.equal(
      (await member.rpc('handle_container', handling())).error?.code,
      '42501',
      'membro não manipula (D-019)',
    );
    const direct = await a.from('container_handlings').insert({
      ...scopeA,
      batch_id: batchId,
      source_container_id: integral,
    });
    assert.equal(direct.error?.code, '42501', 'nada é gravado direto pela API');
    const tamper = await a
      .from('memberships')
      .update({ display_name: 'X' })
      .eq('user_id', users[2].id)
      .select('id');
    assert.ok(
      tamper.error || tamper.data.length === 0,
      'nome não muda por UPDATE direto',
    );

    // Teste 20: revogação durante a sessão: a próxima escrita com o token anterior é negada.
    checked(
      await admin
        .from('memberships')
        .update({ revoked_at: new Date().toISOString() })
        .eq('organization_id', scopeA.organization_id)
        .eq('user_id', users[0].id),
    );
    assert.equal(
      (await a.rpc('handle_container', handling({ p_quantities: [0.5] }))).error
        ?.code,
      '42501',
    );
    assert.equal(
      (
        await a.rpc('set_member_display_name', {
          p_organization_id: scopeA.organization_id,
          p_user_id: users[2].id,
          p_display_name: 'Bia 2',
        })
      ).error?.code,
      '42501',
    );
    assert.deepEqual(
      checked(await a.from('container_handlings').select('id')),
      [],
    );
    assert.equal(
      checked(
        await member
          .from('container_handlings')
          .select('handled_by_name')
          .eq('id', handlingId)
          .single(),
      ).handled_by_name,
      'Bia',
      'histórico continua legível para quem tem vínculo',
    );
  });
});
