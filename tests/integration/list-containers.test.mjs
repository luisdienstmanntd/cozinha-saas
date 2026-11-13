// Fase 6, fatia 6.2: painel e QR com saldo calculado no servidor (teste 11 do desenho, pela API,
// com usuários reais). list_containers e container_expiry_summary são SECURITY INVOKER.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked, localSupabase } from '../../scripts/local-supabase.mjs';

test('painel por recipiente: saldo do servidor, ordem por validade, paginação e isolamento', async () => {
  await withCatalogFixture(async ({ client, users, scopeA, scopeA2 }) => {
    const owner = client(),
      other = client(),
      member = client(),
      anon = localSupabase().client();
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
    const product = checked(
      await owner
        .from('products')
        .insert({ ...scopeA, name: 'Iogurte', unit: 'un' })
        .select('id')
        .single(),
    );
    const supplier = checked(
      await owner
        .from('suppliers')
        .insert({ ...scopeA, name: 'Laticínio' })
        .select('id')
        .single(),
    );
    const receive = async (code, quantity, expiry) =>
      checked(
        await owner.rpc('receive_batch', {
          ...scope,
          p_product_id: product.id,
          p_supplier_id: supplier.id,
          p_source_code: code,
          p_quantity: quantity,
          p_expiry_date: expiry,
          p_expiry_origin: 'original',
          p_original_expiry_date: expiry,
          p_storage_condition: 'ambient',
          p_temperature_status: 'not_required',
          p_received_temperature_c: null,
          p_temperature_reason: null,
          p_intent_id: randomUUID(),
        }),
      );
    const move = async (batch, kind, quantity) =>
      checked(
        await owner.rpc('record_movement', {
          ...scope,
          p_batch_id: batch,
          p_kind: kind,
          p_quantity: quantity,
          p_reason: kind === 'discard' ? 'Teste' : null,
          p_intent_id: randomUUID(),
        }),
      );
    // Recebidos fora da ordem de validade, de propósito.
    const later = await receive('TARDE', 10, '2027-06-01');
    const expired = await receive('VENCIDO', 4, '2020-01-01');
    const gone = await receive('ESGOTADO', 3, '2020-01-02');
    const partial = await receive('PARCIAL', 6, '2027-01-15');
    await move(gone, 'discard', 3);
    await move(partial, 'consumption', 2);
    const reversed = await move(later, 'consumption', 4);
    checked(
      await owner.rpc('reverse_movement', {
        ...scope,
        p_movement_id: reversed,
        p_reason: 'Engano',
        p_intent_id: randomUUID(),
      }),
    );

    const list = async (c, extra = {}) =>
      c.rpc('list_containers', { ...scope, ...extra });
    const rows = checked(await list(owner));
    assert.deepEqual(
      rows.map((row) => [row.source_code, row.balance]),
      [
        ['VENCIDO', 4],
        ['PARCIAL', 4],
        ['TARDE', 10],
      ],
      'só com saldo, do mais urgente ao mais distante, com o saldo e não a quantidade recebida',
    );
    assert.ok(rows.every((row) => /^C-\d{6,}$/.test(row.short_code)));
    assert.equal(rows[1].initial_quantity, 6);
    assert.equal(rows[1].batch_id, partial);

    const all = checked(await list(owner, { p_filter: 'all' }));
    assert.deepEqual(
      all.map((row) => [row.source_code, row.balance]),
      [
        ['VENCIDO', 4],
        ['ESGOTADO', 0],
        ['PARCIAL', 4],
        ['TARDE', 10],
      ],
    );

    // Paginação de um em um: mesma sequência, sem repetição nem salto.
    const paged = [];
    let after = {};
    for (;;) {
      const page = checked(await list(owner, { ...after, p_limit: 1 }));
      if (page.length === 0) break;
      paged.push(page[0].container_id);
      after = {
        p_after_expiry: page[0].expiry_date,
        p_after_id: page[0].container_id,
      };
    }
    assert.deepEqual(
      paged,
      rows.map((row) => row.container_id),
    );

    // Busca no servidor e rota do QR (filtro container), inclusive esgotado.
    assert.deepEqual(
      checked(await list(owner, { p_search: 'parc' })).map(
        (row) => row.source_code,
      ),
      ['PARCIAL'],
    );
    assert.deepEqual(
      checked(await list(owner, { p_search: rows[2].short_code })).map(
        (row) => row.container_id,
      ),
      [rows[2].container_id],
    );
    const goneRow = all.find((row) => row.source_code === 'ESGOTADO');
    assert.deepEqual(
      checked(
        await list(owner, {
          p_filter: 'container',
          p_target_id: goneRow.container_id,
        }),
      ).map((row) => row.balance),
      [0],
    );

    // Contagens só com saldo.
    const summary = async (c, date) =>
      c.rpc('container_expiry_summary', { ...scope, p_reference_date: date });
    assert.deepEqual(checked(await summary(owner, '2027-01-15')), [
      { overdue: 1, due_today: 1, due_tomorrow: 0, later: 1 },
    ]);
    assert.deepEqual(checked(await summary(owner, '2027-01-14')), [
      { overdue: 1, due_today: 0, due_tomorrow: 1, later: 1 },
    ]);

    // Saída concorrente com a leitura: o saldo lido nunca é negativo nem maior que o inicial.
    const reads = await Promise.all([
      move(expired, 'consumption', 1),
      ...Array.from({ length: 8 }, () => list(owner)),
    ]);
    for (const read of reads.slice(1))
      for (const row of checked(read))
        assert.ok(row.balance > 0 && row.balance <= row.initial_quantity);
    assert.equal(
      checked(await list(owner)).find((row) => row.source_code === 'VENCIDO')
        .balance,
      3,
    );

    // Saldo mantido na escrita (plano B): baixas concorrentes no mesmo recipiente nunca passam do saldo,
    // e o saldo guardado coincide com o recalculado do histórico.
    const racing = await Promise.all(
      Array.from({ length: 6 }, () =>
        owner.rpc('record_movement', {
          ...scope,
          p_batch_id: partial,
          p_kind: 'consumption',
          p_quantity: 1,
          p_reason: null,
          p_intent_id: randomUUID(),
        }),
      ),
    );
    assert.equal(racing.filter((r) => !r.error).length, 4);
    const { admin } = localSupabase();
    const stored = checked(
      await admin
        .from('container_balances')
        .select('container_id,balance')
        .eq('organization_id', scopeA.organization_id),
    );
    const history = checked(
      await admin
        .from('stock_movements')
        .select('container_id,kind,quantity')
        .eq('organization_id', scopeA.organization_id),
    );
    const initial = checked(
      await admin
        .from('containers')
        .select('id,initial_quantity')
        .eq('organization_id', scopeA.organization_id),
    );
    assert.equal(stored.length, initial.length);
    for (const { id, initial_quantity } of initial) {
      const exits = history
        .filter((m) => m.container_id === id)
        .reduce(
          (sum, m) =>
            sum + (m.kind === 'reversal' ? -1 : 1) * m.quantity * 1000,
          0,
        );
      assert.equal(
        Math.round(
          stored.find((row) => row.container_id === id).balance * 1000,
        ),
        Math.round(initial_quantity * 1000 - exits),
      );
    }
    assert.deepEqual(
      checked(await list(owner)).map((row) => row.source_code),
      ['VENCIDO', 'TARDE'],
      'recipiente esgotado pelas baixas concorrentes saiu do painel',
    );
    // Ninguém escreve saldo pela API, nem o service_role.
    for (const c of [owner, member, admin])
      assert.ok(
        (
          await c
            .from('container_balances')
            .update({ balance: 999 })
            .eq('organization_id', scopeA.organization_id)
        ).error,
      );

    // Membro lê igual ao proprietário (D-019 restringe só a escrita).
    assert.equal(checked(await list(member)).length, 2);
    assert.deepEqual(checked(await summary(member, '2027-01-15')), [
      { overdue: 1, due_today: 0, due_tomorrow: 0, later: 1 },
    ]);

    // Outra empresa, com os IDs de A: nada, por nenhum filtro.
    assert.deepEqual(checked(await list(other, { p_filter: 'all' })), []);
    assert.deepEqual(
      checked(
        await list(other, {
          p_filter: 'container',
          p_target_id: rows[0].container_id,
        }),
      ),
      [],
    );
    assert.deepEqual(
      checked(await list(other, { p_filter: 'batch', p_target_id: partial })),
      [],
    );
    assert.deepEqual(checked(await summary(other, '2027-01-15')), [
      { overdue: 0, due_today: 0, due_tomorrow: 0, later: 0 },
    ]);

    // Outra unidade da mesma empresa não mostra recipientes desta.
    assert.deepEqual(
      checked(
        await owner.rpc('list_containers', {
          p_organization_id: scopeA2.organization_id,
          p_establishment_id: scopeA2.establishment_id,
          p_filter: 'container',
          p_target_id: rows[0].container_id,
        }),
      ),
      [],
    );

    // Anônimo não executa; parâmetros inválidos são recusados.
    assert.ok((await list(anon)).error);
    assert.ok((await summary(anon, '2027-01-15')).error);
    assert.equal((await list(owner, { p_limit: 201 })).error?.code, '22023');
    assert.equal(
      (await list(owner, { p_filter: 'qualquer' })).error?.code,
      '22023',
    );
  });
});
