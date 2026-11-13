// Fase 6, fatia 6.5b: leitura de ocorrências (list_occurrences) pela API com usuários reais. A tela
// só mostra o que o banco devolve: proprietário e membro de A veem o mesmo bloqueio; proprietário de B
// e anônimo não veem nada; liberar tira da lista aberta; a assinatura antiga não existe mais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

test('ocorrências na tela: mesmo bloqueio para proprietário e membro, nada para outra empresa', async () => {
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
    const product = checked(
      await a
        .from('products')
        .insert({ ...scopeA, name: 'Frango', unit: 'kg' })
        .select('id')
        .single(),
    );
    const supplier = checked(
      await a
        .from('suppliers')
        .insert({ ...scopeA, name: 'Granja' })
        .select('id')
        .single(),
    );
    checked(
      await a.rpc('set_product_storage_condition', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_product_id: product.id,
        p_storage_condition: 'refrigerated',
      }),
    );
    const base = {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_product_id: product.id,
      p_supplier_id: supplier.id,
      p_source_code: 'F-1',
      p_quantity: 4,
      p_expiry_date: '2027-01-01',
      p_expiry_origin: 'original',
      p_original_expiry_date: '2027-01-01',
    };
    const legacy = await a.rpc('receive_batch', {
      ...base,
      p_intent_id: randomUUID(),
    });
    assert.equal(legacy.error?.code, 'PGRST202', 'assinatura antiga retirada');
    const batch = checked(
      await a.rpc('receive_batch', {
        ...base,
        p_storage_condition: 'refrigerated',
        p_temperature_status: 'not_measured',
        p_received_temperature_c: null,
        p_temperature_reason: 'Termômetro sem pilha',
        p_intent_id: randomUUID(),
      }),
    );
    const list = (c, scope = 'open') =>
      c.rpc('list_occurrences', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_scope: scope,
        p_limit: 50,
      });
    const owner = checked(await list(a));
    assert.equal(owner.length, 1);
    assert.equal(owner[0].batch_id, batch);
    assert.equal(owner[0].status, 'pending');
    assert.equal(owner[0].containers.length, 1);
    assert.equal(owner[0].containers[0].balance, 4);
    assert.deepEqual(checked(await list(member)), owner, 'membro vê o mesmo');
    assert.deepEqual(checked(await list(b, 'all')), [], 'outra empresa não vê');
    assert.ok((await list(anon)).error, 'anônimo não lê');
    const blocks = checked(
      await member.rpc('container_blocks', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_container_id: owner[0].containers[0].container_id,
      }),
    );
    assert.equal(blocks.length, 1, 'lista e container_blocks concordam');
    const decide = {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_occurrence_id: owner[0].occurrence_id,
      p_decision: 'released',
      p_reason: 'Medido com termômetro reserva',
      p_intent_id: randomUUID(),
    };
    assert.equal(
      (await member.rpc('decide_occurrence', decide)).error?.code,
      '42501',
      'membro não decide',
    );
    checked(await a.rpc('decide_occurrence', decide));
    assert.deepEqual(checked(await list(member)), [], 'liberada sai da lista');
    const all = checked(await list(member, 'all'));
    assert.equal(all.length, 1);
    assert.equal(all[0].status, 'released');
    assert.equal(all[0].decision_reason, 'Medido com termômetro reserva');
  });
});
