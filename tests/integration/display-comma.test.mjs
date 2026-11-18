// V5B (D-064): exibição com vírgula e temperatura do recebimento com vírgula. Usa a função de exibição e a
// de temperatura reais da tela e as funções reais do banco: o que a API devolve é mostrado sem perder
// casa nenhuma, o que se mostra volta ao mesmo número quando digitado de novo, e a temperatura digitada
// com vírgula grava o mesmo valor que com ponto, com os mesmos limites do banco de sempre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';
import {
  formatQuantity,
  parseQuantity,
  toDotQuantity,
} from '../../src/shared/format/quantity.ts';
import { toDotTemperature } from '../../src/shared/format/temperature.ts';

test('exibição com vírgula preserva o valor guardado e a temperatura aceita vírgula', async () => {
  await withCatalogFixture(async ({ client, users, scopeA }) => {
    const a = client();
    checked(
      await a.auth.signInWithPassword({
        email: users[0].email,
        password: users[0].password,
      }),
    );
    const product = checked(
      await a
        .from('products')
        .insert({
          ...scopeA,
          name: 'Frango V5B',
          unit: 'kg',
        })
        .select('id')
        .single(),
    );
    checked(
      await a.rpc('set_product_storage_condition', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_product_id: product.id,
        p_storage_condition: 'frozen',
      }),
    );
    const supplier = checked(
      await a
        .from('suppliers')
        .insert({ ...scopeA, name: 'Fornecedor V5B' })
        .select('id')
        .single(),
    );
    const receipt = (quantity, code, temperature) => ({
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_product_id: product.id,
      p_supplier_id: supplier.id,
      p_source_code: code,
      p_quantity: quantity,
      p_expiry_date: '2030-01-01',
      p_expiry_origin: 'original',
      p_original_expiry_date: '2030-01-01',
      p_storage_condition: 'frozen',
      p_temperature_status: 'measured',
      p_received_temperature_c: temperature,
      p_temperature_reason: null,
      p_intent_id: randomUUID(),
    });

    // Quantidades guardadas com 1 a 3 casas voltam da API e são mostradas sem perder casa nenhuma.
    const cases = [
      ['0,001', '0,001'],
      ['12,5', '12,5'],
      ['1,250', '1,25'],
      ['333,333', '333,333'],
      ['1500', '1500'],
      ['999999999,999', '999999999,999'],
    ];
    const ids = [];
    for (const [typed] of cases) {
      const dot = toDotQuantity(typed);
      assert.ok(dot, typed);
      ids.push(
        checked(
          await a.rpc(
            'receive_batch',
            receipt(dot, `V5B-${typed}`, toDotTemperature('-18,5')),
          ),
        ),
      );
    }
    const rows = checked(
      await a
        .from('batch_receipts')
        .select('id,quantity,received_temperature_c')
        .in('id', ids),
    );
    assert.equal(rows.length, cases.length);
    cases.forEach(([typed, shown], index) => {
      const row = rows.find((item) => item.id === ids[index]);
      assert.equal(formatQuantity(row.quantity), shown, typed);
      // O que se mostra, digitado de novo, é o mesmo número guardado.
      const again = parseQuantity(formatQuantity(row.quantity));
      assert.ok(again.ok);
      assert.equal(Number(again.value), row.quantity);
      // Temperatura digitada "-18,5" gravou -18.5.
      assert.equal(row.received_temperature_c, -18.5);
    });

    // Mesmos limites do banco: 80,1 e -50,1 chegam como 80.1 e -50.1 e o banco continua recusando.
    for (const typed of ['80,1', '-50,1']) {
      const { error } = await a.rpc(
        'receive_batch',
        receipt('1', 'V5B-limite', toDotTemperature(typed)),
      );
      assert.ok(error, `banco aceitou ${typed}`);
    }
    // Limites exatos continuam valendo.
    for (const typed of ['80,0', '-50,0']) {
      checked(
        await a.rpc(
          'receive_batch',
          receipt('1', `V5B-${typed}`, toDotTemperature(typed)),
        ),
      );
    }
    // Valores já gravados não mudaram com a exibição: leitura repetida devolve o mesmo.
    const again = checked(
      await a.from('batch_receipts').select('id,quantity').in('id', ids),
    );
    for (const row of again)
      assert.equal(row.quantity, rows.find((r) => r.id === row.id).quantity);
  });
});
