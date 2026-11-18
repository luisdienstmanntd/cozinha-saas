// Fase 7, fatia 7.9: pela API real, registrar a temperatura opcional da produção, ler pela mesma consulta
// da tela e confirmar que nada é classificado nem mexe no estoque. Dados sintéticos.
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

test('temperatura da produção pela API: registro, leitura, sem classificação e isolamento', async () => {
  await withCatalogFixture(async ({ admin, client, users, scopeA }) => {
    const owner = client(),
      outsider = client(),
      member = client();
    for (const [c, u] of [
      [owner, users[0]],
      [outsider, users[1]],
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
    const caldo = checked(
      await owner
        .from('products')
        .insert({
          ...scopeA,
          name: 'Caldo de teste',
          unit: 'l',
          kind: 'preparation',
        })
        .select('id')
        .single(),
    ).id;
    checked(
      await owner.rpc('set_product_storage_condition', {
        ...scope,
        p_product_id: caldo,
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
    const batch = checked(
      await owner.rpc('register_production', {
        ...scope,
        p_product_id: caldo,
        p_quantity: 3,
        p_expiry_date: localDate('America/Sao_Paulo', 2),
        p_produced_at: minutesAgo(30),
        p_handled_by: users[0].id,
        p_note: null,
        p_late_reason: null,
        p_intent_id: randomUUID(),
      }),
    );
    const record = (c, moment, value, at = minutesAgo(5)) =>
      c.rpc('record_production_temperature', {
        ...scope,
        p_batch_id: batch,
        p_moment: moment,
        p_temperature_c: value,
        p_measured_at: at,
      });
    // Só a empresa deste teste: outros arquivos de teste rodam ao mesmo tempo no mesmo banco.
    const countOf = async (table) =>
      (
        await admin
          .from(table)
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', scopeA.organization_id)
      ).count;
    const before = [
      await countOf('stock_movements'),
      await countOf('containers'),
      await countOf('batch_receipts'),
      await countOf('occurrences'),
    ];

    // Por padrão só o proprietário registra; outra empresa nunca; escrita direta é recusada.
    assert.equal((await record(member, 'cooling_end', 4)).error?.code, '42501');
    assert.equal(
      (await record(outsider, 'cooling_end', 4)).error?.code,
      '42501',
    );
    const direct = await owner.from('production_temperatures').insert({
      ...scopeA,
      batch_id: batch,
      moment: 'cooling_end',
      temperature_c: 4,
      measured_at: minutesAgo(5),
      recorded_by: users[0].id,
      recorded_by_name: 'Ana Teste',
    });
    assert.ok(direct.error, 'escrita direta é recusada');

    // Valores: faixa, casas decimais, momento e horário.
    assert.equal(
      (await record(owner, 'cooling_end', 80.1)).error?.code,
      '22023',
    );
    assert.equal(
      (await record(owner, 'cooling_end', 4.55)).error?.code,
      '22023',
    );
    assert.equal((await record(owner, 'frio', 4)).error?.code, '22023');
    assert.equal(
      (
        await record(
          owner,
          'cooling_end',
          4,
          new Date(Date.now() + 3600e3).toISOString(),
        )
      ).error?.code,
      '22023',
    );
    assert.equal(
      (await record(owner, 'cooling_end', 4, minutesAgo(120))).error?.code,
      '22023',
    );

    // Valores extremos são só registrados: nada é avaliado nem criado.
    checked(await record(owner, 'cooling_end', 4.5));
    checked(await record(owner, 'reheating', 80));
    checked(await record(owner, 'cooling_end', -50));

    // A consulta da tela traz as temperaturas do lote.
    const listed = checked(
      await owner
        .from('batch_productions')
        .select(
          'batch_id,handled_by,production_temperatures!production_temperatures_production_fk(moment,temperature_c,measured_at,recorded_by_name)',
        )
        .eq('batch_id', batch)
        .single(),
    );
    assert.equal(listed.handled_by, users[0].id);
    assert.equal(listed.production_temperatures.length, 3);
    assert.ok(
      listed.production_temperatures.every(
        (item) => item.recorded_by_name === 'Ana Teste',
      ),
    );

    // Não é estoque nem ocorrência; o registro não é alterado nem apagado.
    assert.deepEqual(
      [
        await countOf('stock_movements'),
        await countOf('containers'),
        await countOf('batch_receipts'),
        await countOf('occurrences'),
      ],
      before,
    );
    const changed = await admin
      .from('production_temperatures')
      .update({ temperature_c: 1 })
      .eq('batch_id', batch);
    assert.ok(changed.error, 'registro não é alterado');
    const removed = await admin
      .from('production_temperatures')
      .delete()
      .eq('batch_id', batch);
    assert.ok(removed.error, 'registro não é apagado');

    // Produção anulada não registra temperatura.
    checked(
      await owner.rpc('void_production', {
        ...scope,
        p_batch_id: batch,
        p_reason: 'Validade digitada errada',
        p_intent_id: randomUUID(),
      }),
    );
    assert.equal((await record(owner, 'cooling_end', 4)).error?.code, '22023');

    // Isolamento: outra empresa não enxerga os registros.
    const hidden = checked(
      await outsider.from('production_temperatures').select('id'),
    );
    assert.equal(hidden.length, 0);
  });
});
