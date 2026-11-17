// Fase 7, fatia 7.2: pela API real, o proprietário anula uma produção sem movimento; o saldo zera, a
// anulação é idempotente e aparece em find_operation; membro não anula; depois de um consumo, a
// anulação é recusada. Dados sintéticos; datas no fuso da unidade (America/Sao_Paulo).
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

test('anular produção pela API: saldo zerado, idempotência, permissões e regra estrita', async () => {
  await withCatalogFixture(async ({ client, users, scopeA }) => {
    const owner = client(),
      member = client();
    for (const [c, u] of [
      [owner, users[0]],
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
          name: 'Suco de laranja',
          unit: 'l',
          kind: 'preparation',
        })
        .select('id')
        .single(),
    );
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
        p_display_name: 'Ana Souza',
      }),
    );
    const produce = async () =>
      checked(
        await owner.rpc('register_production', {
          ...scope,
          p_product_id: preparation.id,
          p_quantity: 3,
          p_expiry_date: localDate('America/Sao_Paulo', 1),
          p_produced_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          p_handled_by: users[2].id,
          p_note: null,
          p_late_reason: null,
          p_intent_id: randomUUID(),
        }),
      );
    const integralOf = async (batchId) =>
      checked(
        await owner
          .from('containers')
          .select('id')
          .eq('batch_id', batchId)
          .eq('kind', 'integral')
          .single(),
      ).id;

    const batchId = await produce();
    const intent = randomUUID();
    const input = {
      ...scope,
      p_batch_id: batchId,
      p_reason: 'Validade digitada errada',
      p_intent_id: intent,
    };
    const denied = await member.rpc('void_production', input);
    assert.equal(denied.error?.code, '42501', 'membro não anula');

    const voidId = checked(await owner.rpc('void_production', input));
    assert.equal(checked(await owner.rpc('void_production', input)), voidId);
    const found = checked(
      await owner.rpc('find_operation', { ...scope, p_intent_id: intent }),
    );
    assert.deepEqual(
      found.map((r) => [r.kind, r.id]),
      [['production_void', voidId]],
    );
    const container = await integralOf(batchId);
    const [row] = checked(
      await owner.rpc('list_containers', {
        ...scope,
        p_filter: 'container',
        p_target_id: container,
      }),
    );
    assert.equal(Number(row.balance), 0, 'o integral anulado fica sem saldo');
    const again = await owner.rpc('void_production', {
      ...input,
      p_intent_id: randomUUID(),
    });
    assert.equal(again.error?.code, '22023');
    assert.match(again.error.message, /já foi anulada/);

    // Depois de um consumo, não anula mais.
    const used = await produce();
    checked(
      await owner.rpc('record_container_movement', {
        ...scope,
        p_container_id: await integralOf(used),
        p_kind: 'consumption',
        p_quantity: 1,
        p_reason: null,
        p_intent_id: randomUUID(),
      }),
    );
    const refused = await owner.rpc('void_production', {
      ...scope,
      p_batch_id: used,
      p_reason: 'Errado',
      p_intent_id: randomUUID(),
    });
    assert.equal(refused.error?.code, '22023');
    assert.match(refused.error.message, /Use o descarte com motivo/);
  });
});
