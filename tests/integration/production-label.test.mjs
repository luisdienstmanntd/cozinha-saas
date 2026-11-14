// Fase 7, fatia 7.8: pela API real, registrar a etiqueta baixada da produção, ler o primeiro download
// pela mesma consulta da tela e confirmar que o registro não mexe no estoque. Dados sintéticos.
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

test('etiqueta baixada da produção pela API: registro, leitura e isolamento', async () => {
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
        p_produced_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        p_handled_by: users[0].id,
        p_note: null,
        p_late_reason: null,
        p_intent_id: randomUUID(),
      }),
    );
    const box = checked(
      await owner
        .from('containers')
        .select('id')
        .eq('batch_id', batch)
        .eq('kind', 'integral')
        .single(),
    ).id;
    const record = (c, container) =>
      c.rpc('record_production_label_download', {
        ...scope,
        p_container_id: container,
      });
    const countOf = async (table) =>
      (await admin.from(table).select('*', { count: 'exact', head: true }))
        .count;
    const before = [
      await countOf('stock_movements'),
      await countOf('containers'),
      await countOf('batch_receipts'),
    ];

    // Por padrão só o proprietário registra; outra empresa nunca; escrita direta é recusada.
    assert.equal((await record(member, box)).error?.code, '42501');
    assert.equal((await record(outsider, box)).error?.code, '42501');
    const direct = await owner.from('production_label_downloads').insert({
      ...scopeA,
      batch_id: batch,
      container_id: box,
      downloaded_by: users[0].id,
    });
    assert.ok(direct.error, 'escrita direta é recusada');
    assert.equal((await record(owner, randomUUID())).error?.code, '23503');

    const at = checked(await record(owner, box));
    assert.ok(Number.isFinite(Date.parse(at)));
    checked(await record(owner, box));

    // A consulta da tela traz os downloads do lote (o aviso usa o primeiro).
    const listed = checked(
      await owner
        .from('batch_productions')
        .select(
          'batch_id,production_label_downloads!production_label_downloads_production_fk(downloaded_at)',
        )
        .eq('batch_id', batch)
        .single(),
    );
    assert.equal(listed.production_label_downloads.length, 2);

    // O registro não mexe no estoque (D-003) e não é alterado nem apagado.
    assert.deepEqual(
      [
        await countOf('stock_movements'),
        await countOf('containers'),
        await countOf('batch_receipts'),
      ],
      before,
    );
    const rows = checked(
      await admin
        .from('production_label_downloads')
        .select('id')
        .eq('batch_id', batch),
    );
    assert.equal(rows.length, 2);
    const changed = await admin
      .from('production_label_downloads')
      .update({ downloaded_at: new Date().toISOString() })
      .eq('batch_id', batch);
    assert.ok(changed.error, 'registro não é alterado');
    const removed = await admin
      .from('production_label_downloads')
      .delete()
      .eq('batch_id', batch);
    assert.ok(removed.error, 'registro não é apagado');

    // Produção anulada não registra etiqueta.
    checked(
      await owner.rpc('void_production', {
        ...scope,
        p_batch_id: batch,
        p_reason: 'Validade digitada errada',
        p_intent_id: randomUUID(),
      }),
    );
    assert.equal((await record(owner, box)).error?.code, '22023');

    // Isolamento: outra empresa não enxerga os registros.
    const hidden = checked(
      await outsider.from('production_label_downloads').select('id'),
    );
    assert.equal(hidden.length, 0);
  });
});
