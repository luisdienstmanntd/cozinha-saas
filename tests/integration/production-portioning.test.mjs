// Fase 7, fatia 7.5: pela API real, a preparação é porcionada a partir do horário da produção (antes do
// registro do lote), a porção leva a validade do lote e as métricas do piloto contam a produção pela RLS.
// Dados sintéticos; datas no fuso da unidade (America/Sao_Paulo).
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
const minutesAgo = (n) => new Date(Date.now() - n * 60 * 1000).toISOString();

test('porcionar preparação pela API e métricas de produção do piloto', async () => {
  await withCatalogFixture(async ({ client, users, scopeA }) => {
    const owner = client(),
      outsider = client();
    for (const [c, u] of [
      [owner, users[0]],
      [outsider, users[1]],
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
          name: 'Molho de teste',
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
        p_user_id: users[0].id,
        p_display_name: 'Ana Teste',
      }),
    );
    const expiry = localDate('America/Sao_Paulo', 2);
    const batchId = checked(
      await owner.rpc('register_production', {
        ...scope,
        p_product_id: preparation.id,
        p_quantity: 4,
        p_expiry_date: expiry,
        p_produced_at: minutesAgo(30),
        p_handled_by: users[0].id,
        p_note: null,
        p_late_reason: null,
        p_intent_id: randomUUID(),
      }),
    );
    const integral = checked(
      await owner
        .from('containers')
        .select('id')
        .eq('batch_id', batchId)
        .eq('kind', 'integral')
        .single(),
    ).id;
    const portion = (overrides) =>
      owner.rpc('handle_container', {
        ...scope,
        p_source_container_id: integral,
        p_kind: 'portioning',
        p_quantities: [2, 2],
        p_expiry_date: expiry,
        p_storage: 'refrigerated',
        p_handled_at: minutesAgo(20),
        p_handled_by: users[0].id,
        p_remainder: 'none',
        p_remainder_reason: null,
        p_note: null,
        p_late_reason: null,
        p_intent_id: randomUUID(),
        ...overrides,
      });
    const shorter = await portion({
      p_expiry_date: localDate('America/Sao_Paulo', 1),
    });
    assert.equal(
      shorter.error?.message,
      'A porção de preparação própria leva a mesma validade do recipiente de origem.',
    );
    // 20 minutos atrás: depois da produção e antes do registro do lote.
    checked(await portion({}));

    const window = {
      ...scope,
      p_from: minutesAgo(24 * 60),
      p_to: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    const [mine] = checked(await owner.rpc('pilot_metrics', window));
    assert.equal(mine.productions_total, 1);
    assert.equal(mine.productions_late, 0);
    assert.equal(mine.production_portionings_total, 1);
    assert.ok(Number(mine.production_delay_max_seconds) >= 30 * 60 - 5);
    const [theirs] = checked(await outsider.rpc('pilot_metrics', window));
    assert.equal(
      theirs.productions_total,
      0,
      'outra empresa não vê as produções de A',
    );
  });
});
