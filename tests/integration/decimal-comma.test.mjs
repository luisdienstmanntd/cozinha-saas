// V5 (M5, D-063): vírgula decimal nas quantidades. A conversão mora na tela (toDotQuantity); o banco
// recebe o mesmo texto com ponto de antes. Este teste usa a função real da tela e as funções reais do
// banco: valor brasileiro convertido grava o mesmo número que o valor com ponto; texto com vírgula ou com
// separador de milhar enviado direto à API continua recusado; outra empresa continua sem acesso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';
import { toDotQuantity } from '../../src/shared/format/quantity.ts';

test('vírgula decimal: tela converte, banco grava o mesmo número e recusa o resto', async () => {
  await withCatalogFixture(async ({ client, users, scopeA }) => {
    const a = client(),
      b = client();
    for (const [c, u] of [
      [a, users[0]],
      [b, users[1]],
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
        .insert({ ...scopeA, name: 'Farinha V5', unit: 'kg' })
        .select('id')
        .single(),
    );
    const supplier = checked(
      await a
        .from('suppliers')
        .insert({ ...scopeA, name: 'Fornecedor V5' })
        .select('id')
        .single(),
    );
    const receipt = (quantity, sourceCode) => ({
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_product_id: product.id,
      p_supplier_id: supplier.id,
      p_source_code: sourceCode,
      p_quantity: quantity,
      p_expiry_date: '2030-01-01',
      p_expiry_origin: 'original',
      p_original_expiry_date: '2030-01-01',
      p_storage_condition: 'ambient',
      p_temperature_status: 'not_required',
      p_received_temperature_c: null,
      p_temperature_reason: null,
      p_intent_id: randomUUID(),
    });

    // "1,250" digitado vira "1.250", o mesmo texto que a tela enviava antes com ponto.
    const typed = toDotQuantity('1,250');
    assert.equal(typed, '1.250');
    const comma = checked(await a.rpc('receive_batch', receipt(typed, 'V5-1')));
    const dot = checked(await a.rpc('receive_batch', receipt('1.25', 'V5-2')));
    const rows = checked(
      await a
        .from('batch_receipts')
        .select('id,quantity')
        .in('id', [comma, dot]),
    );
    assert.equal(rows.length, 2);
    for (const row of rows) assert.equal(row.quantity, 1.25);

    // O banco não ganhou interpretação nova: vírgula ou milhar direto na API continuam recusados.
    for (const raw of ['1,250', '1.000,50', '1,000.50']) {
      const { error } = await a.rpc('receive_batch', receipt(raw, 'V5-x'));
      assert.ok(error, `banco aceitou ${raw}`);
    }
    // A tela nem chega a enviar o que a regra recusa.
    for (const raw of ['1.000,50', '1,000.50', '1.500', '2,5 kg'])
      assert.equal(toDotQuantity(raw), null);

    // Saída "0,5" grava 0.5; o saldo do lote cai de 1.25 para 0.75.
    const out = checked(
      await a.rpc('record_movement', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_batch_id: comma,
        p_kind: 'consumption',
        p_quantity: toDotQuantity('0,5'),
        p_reason: null,
        p_intent_id: randomUUID(),
      }),
    );
    const events = checked(
      await a.from('stock_movements').select('id,quantity').eq('id', out),
    );
    assert.deepEqual(
      events.map((e) => e.quantity),
      [0.5],
    );
    // Precisão de sempre: quatro casas continuam recusadas pelo banco.
    assert.ok(
      (
        await a.rpc('record_movement', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_batch_id: comma,
          p_kind: 'consumption',
          p_quantity: '0.0001',
          p_reason: null,
          p_intent_id: randomUUID(),
        })
      ).error,
    );
    // Saldo acima do registrado continua recusado.
    assert.ok(
      (
        await a.rpc('record_movement', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_batch_id: comma,
          p_kind: 'consumption',
          p_quantity: toDotQuantity('0,751'),
          p_reason: null,
          p_intent_id: randomUUID(),
        })
      ).error,
    );

    // Outra empresa: a mesma quantidade convertida não abre acesso ao lote de A.
    assert.ok(
      (
        await b.rpc('record_movement', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_batch_id: comma,
          p_kind: 'consumption',
          p_quantity: toDotQuantity('0,25'),
          p_reason: null,
          p_intent_id: randomUUID(),
        })
      ).error,
    );
    assert.deepEqual(checked(await b.from('stock_movements').select()), []);
    assert.equal(
      checked(
        await a.from('stock_movements').select('id').eq('batch_id', comma),
      ).length,
      1,
    );
  });
});
