// Fase 6, fatia 6.6: as leituras e chamadas que as telas de abrir, porcionar e anular fazem, com
// usuários reais. Nomes de exibição só pelo proprietário; manipular e anular só pelo proprietário;
// membro lê a mesma origem e os mesmos derivados; outra empresa e anônimo não leem nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

test('abrir, porcionar e anular pela API: papéis, leitura da família e anulação', async () => {
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
    const batch = checked(
      await a.rpc('receive_batch', {
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
        p_intent_id: randomUUID(),
      }),
    );
    const box = checked(
      await a.rpc('ensure_container', { ...ids, p_batch_id: batch }),
    );

    // Pessoas: todos do vínculo leem; só o proprietário define nome.
    const people = (c) =>
      c
        .from('memberships')
        .select('user_id,display_name,role')
        .eq('organization_id', scopeA.organization_id)
        .is('revoked_at', null);
    assert.equal(checked(await people(a)).length, 2);
    const setName = (c, id, name) =>
      c.rpc('set_member_display_name', {
        p_organization_id: scopeA.organization_id,
        p_user_id: id,
        p_display_name: name,
      });
    assert.equal(
      (await setName(member, users[2].id, 'Beto')).error?.code,
      '42501',
      'membro não define nome',
    );
    checked(await setName(a, users[0].id, 'Ana'));
    // Membro só enxerga o próprio vínculo; o nome de quem manipulou chega pela manipulação.
    assert.deepEqual(
      checked(await people(member)).map((m) => m.user_id),
      [users[2].id],
    );

    const handle = (c, patch) =>
      c.rpc('handle_container', {
        ...ids,
        p_source_container_id: box,
        p_kind: 'portioning',
        p_quantities: ['2', '3'],
        p_expiry_date: new Date(Date.now() + 5 * 86400000)
          .toISOString()
          .slice(0, 10),
        p_storage: 'ambient',
        p_handled_at: new Date().toISOString(),
        p_handled_by: users[0].id,
        p_remainder: 'sealed',
        p_remainder_reason: null,
        p_note: null,
        p_late_reason: null,
        p_intent_id: randomUUID(),
        ...patch,
      });
    assert.equal(
      (await handle(member, {})).error?.code,
      '42501',
      'membro não manipula',
    );
    assert.ok((await handle(anon, {})).error, 'anônimo não manipula');
    const excess = await handle(a, {
      p_kind: 'opening',
      p_quantities: ['11'],
      p_remainder: 'none',
    });
    assert.equal(excess.error?.message, 'Quantidade excede saldo registrado.');
    const handling = checked(await handle(a, {}));

    // Leitura que a tela faz: a mesma para proprietário e membro; vazia para outra empresa.
    const read = async (c) => {
      const row = checked(
        await c
          .from('container_handlings')
          .select(
            'id,source_container_id,kind,expiry_date,storage,handled_at,handled_by_name,remainder,remainder_quantity,timezone',
          )
          .eq('id', handling),
      );
      const kids = checked(
        await c
          .from('containers')
          .select('id,short_code,handling_id,position,initial_quantity')
          .eq('handling_id', handling)
          .order('position'),
      );
      return { row, kids };
    };
    const owner = await read(a);
    assert.equal(owner.row.length, 1);
    assert.equal(owner.row[0].handled_by_name, 'Ana');
    assert.equal(owner.row[0].remainder, 'sealed');
    assert.equal(owner.row[0].remainder_quantity, 5);
    assert.deepEqual(
      owner.kids.map((k) => [k.position, k.initial_quantity]),
      [
        [1, 2],
        [2, 3],
      ],
    );
    assert.deepEqual(await read(member), owner, 'membro vê o mesmo');
    const other = await read(b);
    assert.deepEqual([other.row, other.kids], [[], []], 'outra empresa não vê');

    // Anulação: só o proprietário; depois, o registro da anulação é lido e os derivados zeram.
    const voidIt = (c, reason) =>
      c.rpc('void_handling', {
        ...ids,
        p_handling_id: handling,
        p_reason: reason,
        p_intent_id: randomUUID(),
      });
    assert.equal(
      (await voidIt(member, 'x')).error?.code,
      '42501',
      'membro não anula',
    );
    checked(await voidIt(a, 'Lançado por engano'));
    const voids = checked(
      await member
        .from('handling_voids')
        .select('handling_id,reason,created_at')
        .eq('handling_id', handling),
    );
    assert.equal(voids.length, 1);
    assert.equal(voids[0].reason, 'Lançado por engano');
    assert.equal(
      (await voidIt(a, 'de novo')).error?.message,
      'Manipulação já anulada.',
    );
    const balances = checked(
      await a.rpc('list_containers', {
        ...ids,
        p_filter: 'batch',
        p_target_id: batch,
        p_search: null,
        p_after_expiry: null,
        p_after_id: null,
        p_limit: 200,
      }),
    );
    const byId = new Map(balances.map((r) => [r.container_id, r.balance]));
    assert.equal(byId.get(box), 10, 'saldo volta para a origem');
    for (const kid of owner.kids) assert.equal(byId.get(kid.id), 0);
  });
});
