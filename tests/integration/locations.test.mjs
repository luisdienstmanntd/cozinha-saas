// Fase 6, fatia 6.9: locais e mudança de local pela API com usuários reais. Só o proprietário escreve;
// o membro lê; outra empresa e anônimo não veem nada; repetir a mesma mudança não duplica; mover não
// altera saldo nem validade; duas mudanças concorrentes terminam com um local atual coerente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

test('locais: só o proprietário escreve, sem vazar e sem mudar saldo ou validade', async () => {
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
    checked(
      await a.rpc('set_member_display_name', {
        p_organization_id: scopeA.organization_id,
        p_user_id: users[0].id,
        p_display_name: 'Luis',
      }),
    );
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
    const newLocation = (
      c,
      name,
      condition = 'ambient',
      intent = randomUUID(),
    ) =>
      c.rpc('create_storage_location', {
        ...ids,
        p_name: name,
        p_condition: condition,
        p_intent_id: intent,
      });
    const move = (c, location, intent = randomUUID(), confirm = false) =>
      c.rpc('move_container', {
        ...ids,
        p_container_id: box,
        p_location_id: location,
        p_handled_by: users[0].id,
        p_intent_id: intent,
        p_confirm_mismatch: confirm,
      });
    const current = (c, scope = ids) =>
      c.rpc('list_container_locations', scope);
    const stored = () =>
      a
        .from('containers')
        .select('expiry_date')
        .eq('id', box)
        .single()
        .then(checked);
    const balance = async () =>
      checked(
        await a.rpc('list_containers', {
          ...ids,
          p_filter: 'container',
          p_target_id: box,
          p_search: null,
          p_after_expiry: null,
          p_after_id: null,
          p_limit: 1,
        }),
      )[0].balance;

    // Escrita: membro e anônimo recusados; proprietário cria.
    assert.equal((await newLocation(member, 'Despensa')).error?.code, '42501');
    assert.ok((await newLocation(anon, 'Despensa')).error, 'anônimo não cria');
    const pantryIntent = randomUUID();
    const pantry = checked(
      await newLocation(a, 'Despensa', 'ambient', pantryIntent),
    );
    assert.equal(
      checked(await newLocation(a, 'Despensa', 'ambient', pantryIntent)),
      pantry,
      'replay',
    );
    assert.equal(
      (await newLocation(a, ' despensa ')).error?.code,
      '23505',
      'nome repetido',
    );
    const cold = checked(
      await newLocation(a, 'Câmara fria 01', 'refrigerated'),
    );

    // Leitura: membro vê; outra empresa não.
    assert.equal(
      checked(await member.from('storage_locations').select('id')).length,
      2,
    );
    assert.equal(
      checked(await b.from('storage_locations').select('id')).length,
      0,
    );

    // Mover não altera saldo nem validade; replay não duplica; membro e outra empresa recusados.
    const before = {
      balance: await balance(),
      expiry: (await stored()).expiry_date,
    };
    const intent = randomUUID();
    const first = checked(await move(a, pantry, intent));
    assert.equal(
      checked(await move(a, pantry, intent)),
      first,
      'replay devolve o mesmo evento',
    );
    assert.equal(
      checked(
        await a.from('location_moves').select('id').eq('container_id', box),
      ).length,
      1,
    );
    assert.equal((await move(member, cold)).error?.code, '42501');
    assert.equal((await move(b, cold)).error?.code, '42501');
    assert.ok((await move(anon, cold)).error);
    assert.equal(
      (await move(a, pantry)).error?.code,
      '22023',
      'já está neste local',
    );

    // Divergência: ambiente em câmara fria exige confirmação.
    assert.equal((await move(a, cold)).error?.code, '22023');
    checked(await move(a, cold, randomUUID(), true));
    assert.equal(checked(await current(a))[0].location_name, 'Câmara fria 01');
    assert.equal(checked(await current(a))[0].mismatch_confirmed, true);
    assert.deepEqual(
      { balance: await balance(), expiry: (await stored()).expiry_date },
      before,
      'saldo e validade intactos',
    );

    // Sem vazamento na leitura do local atual.
    assert.equal(
      checked(await member.rpc('list_container_locations', ids)).length,
      1,
    );
    assert.equal(
      checked(await b.rpc('list_container_locations', ids)).length,
      0,
    );
    assert.ok((await current(anon)).error, 'anônimo não lê');

    // Local desativado não recebe recipiente; histórico não é apagado nem alterado.
    checked(
      await a.rpc('set_storage_location_active', {
        ...ids,
        p_location_id: pantry,
        p_active: false,
      }),
    );
    assert.equal((await move(a, pantry)).error?.code, '22023');
    assert.equal(
      (
        await a.rpc('set_storage_location_active', {
          ...ids,
          p_location_id: pantry,
          p_active: true,
        })
      ).error,
      null,
    );
    assert.ok(
      (
        await a
          .from('location_moves')
          .update({ kind: 'move' })
          .eq('container_id', box)
      ).error,
      'sem UPDATE direto',
    );
    assert.ok(
      (await a.from('location_moves').delete().eq('container_id', box)).error,
      'sem DELETE direto',
    );

    // Concorrência: duas mudanças ao mesmo tempo para locais diferentes; sobra um local atual coerente
    // com o evento de maior seq.
    const gym = checked(await newLocation(a, 'Freezer 2', 'frozen'));
    const race = await Promise.all([
      move(a, pantry, randomUUID(), true),
      move(a, gym, randomUUID(), true),
    ]);
    assert.ok(
      race.every((r) => !r.error || r.error.code === '22023'),
      JSON.stringify(race.map((r) => r.error)),
    );
    const events = checked(
      await a
        .from('location_moves')
        .select('seq,to_location_id')
        .eq('container_id', box)
        .order('seq', { ascending: false }),
    );
    assert.equal(
      checked(await current(a))[0].location_id,
      events[0].to_location_id,
    );
  });
});
