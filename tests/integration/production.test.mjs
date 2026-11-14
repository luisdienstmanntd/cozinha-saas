// Fase 7, fatia 7.1: pela API real, o proprietário cadastra uma preparação, registra a produção com a
// validade que ele digitou, e o lote aparece no painel com saldo e pela recuperação de tentativa. Membro
// só lê; outra empresa não vê. Dados sintéticos; datas no fuso da unidade (America/Sao_Paulo).
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

test('produção própria pela API: registro, painel, recuperação e permissões', async () => {
  await withCatalogFixture(async ({ client, users, scopeA }) => {
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
    const scope = {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
    };
    const preparation = checked(
      await owner
        .from('products')
        .insert({
          ...scopeA,
          name: 'Caldo de legumes',
          unit: 'l',
          kind: 'preparation',
        })
        .select('id,kind')
        .single(),
    );
    assert.equal(preparation.kind, 'preparation');
    checked(
      await owner.rpc('set_product_storage_condition', {
        ...scope,
        p_product_id: preparation.id,
        p_storage_condition: 'refrigerated',
      }),
    );
    checked(
      await owner.rpc('set_member_display_name', {
        p_organization_id: scopeA.organization_id,
        p_user_id: users[2].id,
        p_display_name: 'Ana',
      }),
    );

    const expiry = localDate('America/Sao_Paulo', 2);
    const producedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const intent = randomUUID();
    const input = {
      ...scope,
      p_product_id: preparation.id,
      p_quantity: 6,
      p_expiry_date: expiry,
      p_produced_at: producedAt,
      p_handled_by: users[2].id,
      p_note: null,
      p_late_reason: null,
      p_intent_id: intent,
    };

    // Membro não registra (D-019).
    const denied = await member.rpc('register_production', input);
    assert.equal(denied.error?.code, '42501');

    const batchId = checked(await owner.rpc('register_production', input));
    assert.equal(
      checked(await owner.rpc('register_production', input)),
      batchId,
      'reenvio devolve o mesmo lote',
    );

    // Recuperação de tentativa (D-045).
    const found = checked(
      await owner.rpc('find_operation', { ...scope, p_intent_id: intent }),
    );
    assert.deepEqual(
      found.map((r) => [r.kind, r.id]),
      [['production', batchId]],
    );

    // Painel: integral com saldo, sem lote do fabricante, validade exatamente a digitada.
    const rows = checked(
      await owner.rpc('list_containers', { ...scope, p_filter: 'all' }),
    );
    const integral = rows.find((r) => r.batch_id === batchId);
    assert.ok(integral, 'o lote produzido aparece no painel');
    assert.equal(integral.kind, 'integral');
    assert.equal(integral.source_code, null);
    assert.equal(integral.expiry_date, expiry);
    assert.equal(Number(integral.balance), 6);
    assert.equal(integral.batch_expiry_origin, 'responsible');

    // Membro lê a produção com o nome de quem produziu; outra empresa não vê nada.
    const seen = checked(
      await member
        .from('batch_productions')
        .select('handled_by_name,late')
        .eq('batch_id', batchId),
    );
    assert.deepEqual(seen, [{ handled_by_name: 'Ana', late: false }]);
    const hidden = checked(
      await other
        .from('batch_productions')
        .select('id')
        .eq('batch_id', batchId),
    );
    assert.equal(hidden.length, 0);
    const insertDirect = await owner.from('batch_productions').insert({
      organization_id: scopeA.organization_id,
      establishment_id: scopeA.establishment_id,
      batch_id: batchId,
    });
    assert.ok(insertDirect.error, 'cliente não insere produção direto');

    // A preparação não entra como recebimento; abrir não vale para ela.
    const supplier = checked(
      await owner
        .from('suppliers')
        .insert({ ...scopeA, name: 'Fornecedor' })
        .select('id')
        .single(),
    );
    const received = await owner.rpc('receive_batch', {
      ...scope,
      p_product_id: preparation.id,
      p_supplier_id: supplier.id,
      p_source_code: 'L1',
      p_quantity: 1,
      p_expiry_date: expiry,
      p_expiry_origin: 'original',
      p_original_expiry_date: expiry,
      p_storage_condition: 'refrigerated',
      p_temperature_status: 'measured',
      p_received_temperature_c: 3,
      p_temperature_reason: null,
      p_intent_id: randomUUID(),
    });
    assert.equal(received.error?.code, '22023');
    assert.match(received.error.message, /não é recebida/);
    const opening = await owner.rpc('handle_container', {
      ...scope,
      p_source_container_id: integral.container_id,
      p_kind: 'opening',
      p_quantities: [1],
      p_expiry_date: expiry,
      p_storage: 'refrigerated',
      p_handled_at: new Date().toISOString(),
      p_handled_by: users[2].id,
      p_remainder: 'sealed',
      p_remainder_reason: null,
      p_note: null,
      p_late_reason: null,
      p_intent_id: randomUUID(),
    });
    assert.equal(opening.error?.code, '22023');
    assert.match(opening.error.message, /não é aberta/);

    // Consumo normal pelo recipiente.
    checked(
      await owner.rpc('record_container_movement', {
        ...scope,
        p_container_id: integral.container_id,
        p_kind: 'consumption',
        p_quantity: 2,
        p_reason: null,
        p_intent_id: randomUUID(),
      }),
    );
    const after = checked(
      await owner.rpc('list_containers', {
        ...scope,
        p_filter: 'container',
        p_target_id: integral.container_id,
      }),
    );
    assert.equal(
      Number(
        after.find((r) => r.container_id === integral.container_id).balance,
      ),
      4,
    );
  });
});
