// Fase 7, fatia 7.6: pela API real, o proprietário grava as configurações da unidade (auditadas), o
// colaborador as lê e, no modo "colaboradores registram a própria produção", registra a própria produção
// com a janela da unidade. Dados sintéticos; datas no fuso da unidade (America/Sao_Paulo).
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

test('configurações da unidade e produção registrada pelo colaborador, pela API', async () => {
  await withCatalogFixture(
    async ({ admin, client, users, scopeA, scopeA2 }) => {
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
      const preparation = checked(
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
          p_display_name: 'Bia Teste',
        }),
      );
      const produce = (c, by, minutes, late) =>
        c.rpc('register_production', {
          ...scope,
          p_product_id: preparation.id,
          p_quantity: 3,
          p_expiry_date: localDate('America/Sao_Paulo', 2),
          p_produced_at: minutesAgo(minutes),
          p_handled_by: by,
          p_note: null,
          p_late_reason: late,
          p_intent_id: randomUUID(),
        });
      const settings = (c, registrar, window, target = scope) =>
        c.rpc('set_establishment_settings', {
          ...target,
          p_production_registrar: registrar,
          p_production_window_minutes: window,
          p_unlabeled_limit_minutes: 60,
          p_portion_expiry_rule: 'equal',
        });

      // Padrão: colaborador não registra; nada gravado nas configurações.
      const refused = await produce(member, users[2].id, 5, null);
      assert.equal(refused.error?.code, '42501');
      assert.deepEqual(
        checked(
          await member.from('establishment_settings').select('organization_id'),
        ),
        [],
      );

      // Só o proprietário da empresa grava; a tabela não aceita escrita direta.
      assert.equal((await settings(member, 'member', 90)).error?.code, '42501');
      assert.equal(
        (await settings(outsider, 'member', 90)).error?.code,
        '42501',
      );
      const direct = await owner
        .from('establishment_settings')
        .insert({ ...scopeA, production_registrar: 'member' });
      assert.ok(direct.error, 'insert direto é recusado');
      const saved = checked(await settings(owner, 'member', 90));
      assert.equal(saved.production_registrar, 'member');
      assert.equal(saved.production_window_minutes, 90);
      const read = checked(
        await member
          .from('establishment_settings')
          .select('production_registrar,production_window_minutes')
          .eq('establishment_id', scopeA.establishment_id)
          .single(),
      );
      assert.deepEqual(read, {
        production_registrar: 'member',
        production_window_minutes: 90,
      });
      assert.deepEqual(
        checked(
          await outsider
            .from('establishment_settings')
            .select('organization_id'),
        ),
        [],
      );
      const audit = checked(
        await owner
          .from('entity_changes')
          .select('field,old_value,new_value')
          .eq('entity', 'establishment')
          .eq('entity_id', scopeA.establishment_id)
          .order('field'),
      );
      assert.deepEqual(audit, [
        {
          field: 'production_registrar',
          old_value: 'owner',
          new_value: 'member',
        },
        {
          field: 'production_window_minutes',
          old_value: '120',
          new_value: '90',
        },
      ]);

      // Colaborador registra a própria produção; não em nome de outra pessoa.
      const own = checked(await produce(member, users[2].id, 10, null));
      const other = await produce(member, users[0].id, 10, null);
      assert.equal(other.error?.code, '42501');
      assert.equal(
        other.error?.message,
        'Quem não é proprietário registra só a própria produção.',
      );
      const late = await produce(member, users[2].id, 100, null);
      assert.equal(
        late.error?.message,
        'Produção registrada mais de 1 hora e 30 minutos depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
      );
      const row = checked(
        await admin
          .from('batch_productions')
          .select('created_by,handled_by_name,late,late_window_minutes')
          .eq('batch_id', own)
          .single(),
      );
      assert.deepEqual(row, {
        created_by: users[2].id,
        handled_by_name: 'Bia Teste',
        late: false,
        late_window_minutes: 90,
      });
      // Anular continua só do proprietário.
      const voided = await member.rpc('void_production', {
        ...scope,
        p_batch_id: own,
        p_reason: 'Erro',
        p_intent_id: randomUUID(),
      });
      assert.equal(voided.error?.code, '42501');
      // A configuração é por unidade: a outra unidade segue o padrão.
      const elsewhere = checked(
        await owner
          .from('products')
          .insert({
            ...scopeA2,
            name: 'Molho de teste',
            unit: 'l',
            kind: 'preparation',
          })
          .select('id')
          .single(),
      );
      const otherUnit = await member.rpc('register_production', {
        p_organization_id: scopeA2.organization_id,
        p_establishment_id: scopeA2.establishment_id,
        p_product_id: elsewhere.id,
        p_quantity: 1,
        p_expiry_date: localDate('America/Sao_Paulo', 2),
        p_produced_at: minutesAgo(5),
        p_handled_by: users[2].id,
        p_note: null,
        p_late_reason: null,
        p_intent_id: randomUUID(),
      });
      assert.equal(otherUnit.error?.code, '42501');
    },
  );
});
