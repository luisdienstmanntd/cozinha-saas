// Fase 6, fatia 6.5a: conservação, temperatura e ocorrências pela API com usuários reais (testes 6 na
// parte tardia, 14, 19 com decisão e 22 do desenho). Recebimento com e sem medição, bloqueio,
// decisão concorrente idêntica, decisão × consumo e × descarte na mesma origem, manipulação tardia,
// revogação durante a sessão e isolamento entre empresas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

function unitDate(offsetDays) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

test('ocorrências: recebimento sem medição, bloqueio, decisão concorrente e isolamento pela API', async () => {
  await withCatalogFixture(async ({ admin, client, users, scopeA }) => {
    const a = client(),
      b = client(),
      member = client();
    for (const [c, u] of [
      [a, users[0]],
      [b, users[1]],
      [member, users[2]],
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
        .insert({ ...scopeA, name: 'Peixe', unit: 'kg' })
        .select('id')
        .single(),
    );
    const supplier = checked(
      await a
        .from('suppliers')
        .insert({ ...scopeA, name: 'Pescados' })
        .select('id')
        .single(),
    );
    assert.equal(
      checked(
        await a.rpc('set_product_storage_condition', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_product_id: product.id,
          p_storage_condition: 'frozen',
        }),
      ),
      'frozen',
    );
    const receiveArgs = (overrides = {}) => ({
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_product_id: product.id,
      p_supplier_id: supplier.id,
      p_source_code: 'P-' + randomUUID().slice(0, 8),
      p_quantity: 10,
      p_expiry_date: unitDate(10),
      p_expiry_origin: 'original',
      p_original_expiry_date: unitDate(10),
      p_storage_condition: 'frozen',
      p_temperature_status: 'not_measured',
      p_received_temperature_c: null,
      p_temperature_reason: 'Termômetro em manutenção',
      p_intent_id: randomUUID(),
      ...overrides,
    });
    const integralOf = async (batchId) =>
      checked(
        await a
          .from('containers')
          .select('id')
          .eq('batch_id', batchId)
          .eq('kind', 'integral')
          .single(),
      ).id;
    const occurrenceOf = async (batchId) =>
      checked(
        await a
          .from('occurrences')
          .select('id')
          .eq('batch_id', batchId)
          .eq('kind', 'temperature_not_measured')
          .single(),
      ).id;
    const balanceOf = async (id) =>
      checked(
        await a
          .from('container_balances')
          .select('balance')
          .eq('container_id', id)
          .single(),
      ).balance;
    const move = (containerId, kind, quantity) =>
      a.rpc('record_container_movement', {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
        p_container_id: containerId,
        p_kind: kind,
        p_quantity: quantity,
        p_reason: kind === 'discard' ? 'Descarte de teste' : null,
        p_intent_id: randomUUID(),
      });
    const decideArgs = (occurrenceId, overrides = {}) => ({
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_occurrence_id: occurrenceId,
      p_decision: 'released',
      p_reason: 'Temperatura conferida depois com outro termômetro',
      p_intent_id: randomUUID(),
      ...overrides,
    });
    const blocksOf = async (containerId) =>
      checked(
        await a.rpc('container_blocks', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_container_id: containerId,
        }),
      ).map((r) => `${r.kind}:${r.status}`);

    // Teste 14 pela API: reenvio concorrente idêntico do recebimento sem medição cria um recebimento e
    // uma ocorrência; o recipiente nasce bloqueado.
    const rcv1 = receiveArgs();
    const sent = (
      await Promise.all(
        Array.from({ length: 4 }, () => a.rpc('receive_batch', rcv1)),
      )
    ).map(checked);
    assert.equal(new Set(sent).size, 1, 'mesmo recebimento para os envios');
    const batch1 = sent[0];
    assert.equal(
      checked(await a.from('occurrences').select('id').eq('batch_id', batch1))
        .length,
      1,
    );
    const integral1 = await integralOf(batch1);
    assert.deepEqual(await blocksOf(integral1), [
      'temperature_not_measured:pending',
    ]);
    assert.equal(
      (await move(integral1, 'consumption', 1)).error?.code,
      '22023',
    );
    assert.equal(
      (
        await a.rpc(
          'receive_batch',
          receiveArgs({
            p_storage_condition: 'ambient',
            p_temperature_status: 'not_required',
            p_temperature_reason: null,
          }),
        )
      ).error?.code,
      '22023',
      'conservação diferente da do produto recusada',
    );
    const oldSignature = await a.rpc('receive_batch', {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_product_id: product.id,
      p_supplier_id: supplier.id,
      p_source_code: 'P-antigo',
      p_quantity: 1,
      p_expiry_date: unitDate(10),
      p_expiry_origin: 'original',
      p_original_expiry_date: unitDate(10),
      p_intent_id: randomUUID(),
    });
    // 6.5b: a assinatura sem conservação nem temperatura foi retirada; a API não a encontra.
    assert.equal(
      oldSignature.error?.code,
      'PGRST202',
      'assinatura antiga de receive_batch não existe mais',
    );

    // Teste 19 (decisão): cinco reenvios concorrentes idênticos, uma decisão.
    const occurrence1 = await occurrenceOf(batch1);
    const args1 = decideArgs(occurrence1);
    const decided = (
      await Promise.all(
        Array.from({ length: 5 }, () => a.rpc('decide_occurrence', args1)),
      )
    ).map(checked);
    assert.equal(new Set(decided).size, 1, 'mesmo ID para os cinco envios');
    assert.equal(
      checked(
        await a
          .from('occurrence_decisions')
          .select('id')
          .eq('occurrence_id', occurrence1),
      ).length,
      1,
    );
    assert.deepEqual(await blocksOf(integral1), []);
    checked(await move(integral1, 'consumption', 1));

    // Decisões concorrentes diferentes para a mesma ocorrência: só uma passa, sem troca.
    const batch2 = checked(await a.rpc('receive_batch', receiveArgs()));
    const occurrence2 = await occurrenceOf(batch2);
    const pairDecision = await Promise.all([
      a.rpc('decide_occurrence', decideArgs(occurrence2)),
      a.rpc(
        'decide_occurrence',
        decideArgs(occurrence2, {
          p_decision: 'rejected',
          p_reason: 'Sem como confirmar',
        }),
      ),
    ]);
    assert.equal(pairDecision.filter((x) => !x.error).length, 1);
    assert.equal(
      pairDecision.filter((x) => x.error?.code === '23505').length,
      1,
    );

    // Teste 22: decisão × consumo e × descarte na mesma origem, várias rodadas. A decisão bloqueia a
    // linha do recebimento (I-6): o consumo vê a ocorrência aberta (recusado) ou a liberação (aceito),
    // nunca consome sem decisão; com rejeição, o consumo é sempre recusado; o descarte sempre passa.
    for (let round = 0; round < 4; round += 1) {
      const batch = checked(await a.rpc('receive_batch', receiveArgs()));
      const integral = await integralOf(batch);
      const occurrence = await occurrenceOf(batch);
      const release = round % 2 === 0;
      const [decision, consumption, discard] = await Promise.all([
        a.rpc(
          'decide_occurrence',
          decideArgs(
            occurrence,
            release ? {} : { p_decision: 'rejected', p_reason: 'Recusado' },
          ),
        ),
        move(integral, 'consumption', 2),
        move(integral, 'discard', 3),
      ]);
      checked(decision);
      checked(discard);
      if (release) {
        assert.ok(
          !consumption.error || consumption.error.code === '22023',
          `rodada ${round}: consumo aceito depois da liberação ou recusado antes dela`,
        );
      } else {
        assert.equal(
          consumption.error?.code,
          '22023',
          `rodada ${round}: consumo nunca passa com rejeição`,
        );
      }
      const consumed = !consumption.error;
      assert.equal(await balanceOf(integral), 10 - 3 - (consumed ? 2 : 0));
      if (consumed) {
        const rows = checked(
          await a
            .from('occurrence_decisions')
            .select('decision')
            .eq('occurrence_id', occurrence),
        );
        assert.deepEqual(rows, [{ decision: 'released' }]);
      }
    }

    // Teste 6 (parte tardia) pela API: manipulação de um recebimento medido, registrada mais de 2 horas
    // depois, só com justificativa; derivado bloqueado até a decisão.
    const fish = checked(
      await a
        .from('products')
        .insert({ ...scopeA, name: 'Salmão', unit: 'kg' })
        .select('id')
        .single(),
    );
    const measured = checked(
      await a.rpc(
        'receive_batch',
        receiveArgs({
          p_product_id: fish.id,
          p_storage_condition: 'refrigerated',
          p_temperature_status: 'measured',
          p_received_temperature_c: 3.5,
          p_temperature_reason: null,
        }),
      ),
    );
    const measuredIntegral = await integralOf(measured);
    assert.deepEqual(await blocksOf(measuredIntegral), []);
    checked(
      await a.rpc('set_member_display_name', {
        p_organization_id: scopeA.organization_id,
        p_user_id: users[2].id,
        p_display_name: 'Bia',
      }),
    );
    // A API não permite recuar created_at do recebimento; a janela é conferida no pgTAP. Aqui, a
    // justificativa dentro da janela é recusada e a manipulação comum continua aceita.
    const handleArgs = (overrides = {}) => ({
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
      p_source_container_id: measuredIntegral,
      p_kind: 'opening',
      p_quantities: [2],
      p_expiry_date: unitDate(5),
      p_storage: 'refrigerated',
      p_handled_at: new Date().toISOString(),
      p_handled_by: users[2].id,
      p_remainder: 'sealed',
      p_remainder_reason: null,
      p_note: null,
      p_late_reason: null,
      p_intent_id: randomUUID(),
      ...overrides,
    });
    assert.equal(
      (
        await a.rpc(
          'handle_container',
          handleArgs({ p_late_reason: 'Não estava atrasado' }),
        )
      ).error?.code,
      '22023',
    );
    checked(await a.rpc('handle_container', handleArgs()));

    // Leitura e isolamento: membro lê ocorrências e decisões; outra empresa não vê nada e não decide.
    assert.equal(
      checked(
        await member.from('occurrences').select('id').eq('id', occurrence1),
      ).length,
      1,
    );
    assert.deepEqual(
      checked(await b.from('occurrences').select('id').eq('id', occurrence1)),
      [],
    );
    assert.deepEqual(
      checked(
        await b.rpc('container_blocks', {
          p_organization_id: scopeA.organization_id,
          p_establishment_id: scopeA.establishment_id,
          p_container_id: integral1,
        }),
      ),
      [],
      'container_blocks não revela nada de A para B',
    );
    const batch3 = checked(await a.rpc('receive_batch', receiveArgs()));
    const occurrence3 = await occurrenceOf(batch3);
    assert.equal(
      (await b.rpc('decide_occurrence', decideArgs(occurrence3))).error?.code,
      '42501',
      'proprietário de outra empresa não decide em A',
    );
    assert.equal(
      (await member.rpc('decide_occurrence', decideArgs(occurrence3))).error
        ?.code,
      '42501',
      'membro não decide (D-019)',
    );
    const direct = await a.from('occurrence_decisions').insert({
      ...scopeA,
      batch_id: batch3,
      occurrence_id: occurrence3,
      decision: 'released',
      reason: 'x',
      intent_id: randomUUID(),
      timezone: 'UTC',
    });
    assert.equal(direct.error?.code, '42501', 'nada é gravado direto pela API');

    // Revogação durante a sessão: a próxima decisão com o token anterior é negada, inclusive o replay.
    checked(
      await admin
        .from('memberships')
        .update({ revoked_at: new Date().toISOString() })
        .eq('organization_id', scopeA.organization_id)
        .eq('user_id', users[0].id),
    );
    assert.equal(
      (await a.rpc('decide_occurrence', decideArgs(occurrence3))).error?.code,
      '42501',
    );
    assert.equal(
      (await a.rpc('decide_occurrence', args1)).error?.code,
      '42501',
      'replay também é reautorizado',
    );
    assert.equal(
      checked(
        await member
          .from('occurrence_decisions')
          .select('id')
          .eq('occurrence_id', occurrence3),
      ).length,
      0,
    );
  });
});
