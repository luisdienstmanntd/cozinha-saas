// Fase 7, fatia 7.7: pela API real, o proprietário define a janela de registro da produção de uma
// preparação (auditada), ela vale no registro no lugar da janela da unidade, e o registro guarda a janela
// usada. Dados sintéticos; datas no fuso da unidade (America/Sao_Paulo).
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

test('janela por preparação pela API: definição auditada e efeito no registro', async () => {
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
    const make = async (name, kind) => {
      const row = checked(
        await owner
          .from('products')
          .insert({ ...scopeA, name, unit: 'l', kind })
          .select('id')
          .single(),
      );
      if (kind === 'preparation')
        checked(
          await owner.rpc('set_product_storage_condition', {
            ...scope,
            p_product_id: row.id,
            p_storage_condition: 'refrigerated',
          }),
        );
      return row.id;
    };
    const caldo = await make('Caldo de teste', 'preparation');
    const molho = await make('Molho de teste', 'preparation');
    const arroz = await make('Arroz de teste', 'product');
    checked(
      await owner.rpc('set_member_display_name', {
        p_organization_id: scopeA.organization_id,
        p_user_id: users[0].id,
        p_display_name: 'Ana Teste',
      }),
    );
    const window = (c, product, minutes) =>
      c.rpc('set_preparation_window', {
        ...scope,
        p_product_id: product,
        p_minutes: minutes,
      });
    const produce = (product, minutes, late) =>
      owner.rpc('register_production', {
        ...scope,
        p_product_id: product,
        p_quantity: 3,
        p_expiry_date: localDate('America/Sao_Paulo', 2),
        p_produced_at: minutesAgo(minutes),
        p_handled_by: users[0].id,
        p_note: null,
        p_late_reason: late,
        p_intent_id: randomUUID(),
      });

    // A janela não é gravada direto; só o proprietário da empresa a define; só preparação a tem.
    const direct = await owner
      .from('products')
      .update({ production_window_minutes: 60 })
      .eq('id', caldo);
    assert.ok(direct.error, 'escrita direta é recusada');
    assert.equal((await window(member, caldo, 60)).error?.code, '42501');
    assert.equal((await window(outsider, caldo, 60)).error?.code, '42501');
    assert.equal((await window(owner, arroz, 60)).error?.code, '22023');
    assert.equal((await window(owner, caldo, 14)).error?.code, '22023');
    assert.equal((await window(owner, caldo, 1441)).error?.code, '22023');

    // Sem janela própria, vale a da unidade (2 horas).
    const unit = await produce(caldo, 150, null);
    assert.equal(unit.error?.code, '22023');
    assert.match(unit.error?.message, /mais de 2 horas/);

    // Com 4 horas no caldo, 150 minutos está dentro; o molho segue com a da unidade.
    assert.equal(checked(await window(owner, caldo, 240)), 240);
    const batch = checked(await produce(caldo, 150, null));
    const stored = checked(
      await admin
        .from('batch_productions')
        .select('late,late_window_minutes')
        .eq('batch_id', batch)
        .single(),
    );
    assert.deepEqual(stored, { late: false, late_window_minutes: 240 });
    const sauce = await produce(molho, 150, null);
    assert.equal(sauce.error?.code, '22023');
    const tooLate = await produce(caldo, 300, null);
    assert.match(tooLate.error?.message, /mais de 4 horas/);

    // Auditada: anterior (nenhum), novo, quem mudou. Repetir não gera linha.
    checked(await window(owner, caldo, 240));
    const audit = checked(
      await owner
        .from('entity_changes')
        .select('field,old_value,new_value,changed_by')
        .eq('entity', 'product')
        .eq('entity_id', caldo)
        .eq('field', 'production_window_minutes'),
    );
    assert.deepEqual(audit, [
      {
        field: 'production_window_minutes',
        old_value: null,
        new_value: '240',
        changed_by: users[0].id,
      },
    ]);

    // Mudar a janela não reescreve produção antiga; voltar à da unidade volta a valer 2 horas.
    assert.equal(checked(await window(owner, caldo, 20)), 20);
    const after = checked(
      await admin
        .from('batch_productions')
        .select('late,late_window_minutes')
        .eq('batch_id', batch)
        .single(),
    );
    assert.deepEqual(after, { late: false, late_window_minutes: 240 });
    assert.equal(checked(await window(owner, caldo, null)), null);
    const back = await produce(caldo, 150, null);
    assert.match(back.error?.message, /mais de 2 horas/);

    // O colaborador lê a janela no catálogo.
    checked(await window(owner, caldo, 90));
    const read = checked(
      await member
        .from('products')
        .select('production_window_minutes')
        .eq('id', caldo)
        .single(),
    );
    assert.equal(read.production_window_minutes, 90);
  });
});
