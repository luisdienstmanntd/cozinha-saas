// D-079: histórico da unidade. As consultas de leitura da tela (mesmas tabelas e colunas de
// src/features/history/data/supabaseHistory.ts) com usuários reais: o proprietário lê todas as fontes da
// unidade; o registro de alterações é só do proprietário; outra empresa e anônimo não leem nada; e nenhuma
// fonte aceita escrita direta (a tela só consulta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

const SOURCES = {
  batch_receipts:
    'id,product_id,supplier_id,quantity,unit,expiry_date,created_by,created_at',
  stock_movements:
    'id,batch_id,container_id,kind,quantity,reason,created_by,created_at',
  container_handlings:
    'id,batch_id,source_container_id,kind,portion_count,total_quantity,note,handled_by_name,created_at',
  handling_voids: 'id,batch_id,reason,created_by,created_at',
  location_moves:
    'id,container_id,from_location_id,to_location_id,handled_by_name,created_at',
  occurrences: 'id,batch_id,kind,reason,created_by,created_at',
  occurrence_decisions: 'id,batch_id,decision,reason,created_by,created_at',
  batch_productions:
    'id,batch_id,produced_at,late,handled_by_name,note,created_at',
  production_voids: 'id,batch_id,reason,created_by,created_at',
};
const REGISTRY =
  'id,entity,entity_id,field,old_value,new_value,changed_by,changed_at';

test('histórico: fontes legíveis só no escopo, registro de alterações só do proprietário, nada de escrita', async () => {
  await withCatalogFixture(async ({ client, users, scopeA }) => {
    const owner = client(),
      other = client(),
      member = client(),
      anon = client();
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
    const ids = {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
    };
    const product = checked(
      await owner
        .from('products')
        .insert({ ...scopeA, name: 'Arroz', unit: 'kg' })
        .select('id')
        .single(),
    );
    checked(
      await owner.rpc('set_product_storage_condition', {
        ...ids,
        p_product_id: product.id,
        p_storage_condition: 'ambient',
      }),
    );
    const supplier = checked(
      await owner
        .from('suppliers')
        .insert({ ...scopeA, name: 'Horta' })
        .select('id')
        .single(),
    );
    checked(
      await owner.rpc('receive_batch', {
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
    checked(
      await owner
        .from('establishments')
        .update({ name: 'Cozinha renomeada' })
        .eq('id', scopeA.establishment_id),
    );

    const read = (c, table, columns, extra = (q) => q) =>
      extra(
        c
          .from(table)
          .select(columns)
          .eq('organization_id', scopeA.organization_id),
      );
    const inUnit = (q) => q.eq('establishment_id', scopeA.establishment_id);

    // Proprietário: todas as fontes respondem (sem erro de coluna ou de política).
    for (const [table, columns] of Object.entries(SOURCES))
      checked(await read(owner, table, columns, inUnit));
    assert.equal(
      checked(
        await read(owner, 'batch_receipts', SOURCES.batch_receipts, inUnit),
      ).length,
      1,
    );
    const registry = checked(
      await read(owner, 'entity_changes', REGISTRY, (q) =>
        q.or(
          `establishment_id.is.null,establishment_id.eq.${scopeA.establishment_id}`,
        ),
      ),
    );
    assert.ok(
      registry.some((r) => r.entity === 'establishment' && r.field === 'name'),
    );
    assert.ok(
      registry.some(
        (r) => r.entity === 'product' && r.field === 'storage_condition',
      ),
    );

    // Registro de alterações: colaborador, outra empresa e anônimo não leem.
    for (const c of [member, other])
      assert.deepEqual(
        checked(
          await read(c, 'entity_changes', REGISTRY, (q) =>
            q.or(
              `establishment_id.is.null,establishment_id.eq.${scopeA.establishment_id}`,
            ),
          ),
        ),
        [],
      );
    const anonRegistry = await read(anon, 'entity_changes', REGISTRY);
    assert.ok(anonRegistry.error || anonRegistry.data.length === 0);

    // Outra empresa e anônimo não leem nenhuma fonte.
    for (const [table, columns] of Object.entries(SOURCES)) {
      assert.deepEqual(
        checked(await read(other, table, columns, inUnit)),
        [],
        `${table}: outra empresa`,
      );
      const denied = await read(anon, table, columns, inUnit);
      assert.ok(denied.error || denied.data.length === 0, `${table}: anônimo`);
    }

    // A tela só consulta: nenhuma fonte aceita escrita direta do proprietário.
    for (const table of [...Object.keys(SOURCES), 'entity_changes']) {
      const write = await owner
        .from(table)
        .update({ created_at: new Date().toISOString() })
        .eq('organization_id', scopeA.organization_id)
        .select('id');
      assert.ok(
        write.error || (write.data ?? []).length === 0,
        `${table}: sem atualização direta`,
      );
    }
  });
});
