import { randomUUID } from 'node:crypto';
import { checked } from '../../scripts/local-supabase.mjs';
import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { areaLink, openArea, newCatalogItem } from './areas.mjs';

// D-076: Indicadores da unidade (só leitura, `pilot_metrics`). O proprietário vê a página e os números
// do banco; o colaborador não tem a área e o endereço direto volta para a Visão geral. Dados sintéticos;
// "ontem" é a data da unidade (America/Sao_Paulo).
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Abrir Cozinha principal' }),
  ).toBeVisible();
}

function localDate(offsetDays) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const value = new Date(`${today}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function tile(page, group, label) {
  return page
    .getByRole('region', { name: group, exact: true })
    .locator('.metrics-tile')
    .filter({ has: page.getByText(label, { exact: true }) });
}

test('proprietário: indicadores da unidade com números do banco e atalho para vencidos', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await withCatalogFixture(async ({ users, client, scopeA }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();

    await openArea(page, 'Indicadores');
    await expect(
      page.getByRole('heading', { name: 'Indicadores', level: 2 }),
    ).toBeVisible();
    await expect(page.getByText(/Últimos 30 dias: de/)).toBeVisible();
    await expect(
      tile(page, 'Situação agora', 'Recipientes vencidos com saldo'),
    ).toContainText('0');
    await expect(
      page.getByRole('region', { name: 'Volume de registros', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', {
        name: 'Abertura e porcionamento',
        exact: true,
      }),
    ).toBeHidden();
    await page.getByText('Ver todos os indicadores', { exact: true }).click();
    await expect(
      tile(page, 'Abertura e porcionamento', 'Tempo até o registro (mediana)'),
    ).toContainText('Sem registros no período');
    await expect(
      page.getByRole('link', { name: 'Ver vencidos em Validades' }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('01-indicadores-vazio-desktop.png'),
      fullPage: true,
    });

    // Um recebimento já vencido conta como recipiente vencido com saldo.
    await newCatalogItem(page, 'Produtos');
    await page.getByLabel('Nome do produto').fill('Arroz agulhinha');
    await page.getByLabel('Unidade de medida').selectOption('kg');
    await page
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('ambient');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await newCatalogItem(page, 'Fornecedores');
    await page.getByLabel('Nome do fornecedor').fill('Distribuidora Central');
    await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await openArea(page, 'Receber');
    await page
      .getByRole('combobox', { name: 'Produto', exact: true })
      .selectOption({ label: 'Arroz agulhinha (kg)' });
    await page
      .getByRole('combobox', { name: 'Fornecedor', exact: true })
      .selectOption({ label: 'Distribuidora Central' });
    await page.getByLabel('Lote de origem').fill('IND-ONTEM');
    await page.getByLabel('Quantidade recebida').fill('5');
    await page.getByLabel('Data de validade').fill(localDate(-1));
    await page.getByRole('button', { name: 'Registrar recebimento' }).click();
    await expect(page.getByText('Recebimento registrado.')).toBeVisible();

    await openArea(page, 'Indicadores');
    await expect(
      tile(page, 'Situação agora', 'Recipientes vencidos com saldo'),
    ).toContainText('1');
    await page.getByRole('button', { name: 'Últimos 7 dias' }).click();
    await expect(page.getByText(/Últimos 7 dias: de/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Últimos 7 dias' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Últimos 30 dias' }).click();
    await expect(page.getByText(/Últimos 30 dias: de/)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('02-indicadores-desktop.png'),
      fullPage: true,
    });

    await page.getByRole('link', { name: 'Ver vencidos em Validades' }).click();
    await expect(areaLink(page, 'Validade')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page).toHaveURL(/validade=vencidos/);
    await expect(
      page
        .getByRole('list', { name: 'Recipientes e validade' })
        .getByRole('listitem')
        .filter({ hasText: 'IND-ONTEM' }),
    ).toBeVisible();

    // Dados positivos pelo mesmo contrato autenticado usado pela produção; nada é simulado na resposta.
    const owner = client();
    checked(
      await owner.auth.signInWithPassword({
        email: users[0].email,
        password: users[0].password,
      }),
    );
    try {
      const scope = {
        p_organization_id: scopeA.organization_id,
        p_establishment_id: scopeA.establishment_id,
      };
      const preparation = checked(
        await owner
          .from('products')
          .insert({
            ...scopeA,
            name: 'Molho dos indicadores',
            unit: 'kg',
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
          p_display_name: 'Responsável indicadores',
        }),
      );
      for (const minutes of [20, 180])
        checked(
          await owner.rpc('register_production', {
            ...scope,
            p_product_id: preparation.id,
            p_quantity: 1,
            p_expiry_date: localDate(2),
            p_produced_at: new Date(Date.now() - minutes * 60000).toISOString(),
            p_handled_by: users[0].id,
            p_note: null,
            p_late_reason:
              minutes === 180 ? 'Registro de teste após o preparo' : null,
            p_intent_id: randomUUID(),
          }),
        );
    } finally {
      await owner.auth.signOut({ scope: 'local' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await openArea(page, 'Indicadores');
    await expect(page.getByText(/Últimos 30 dias: de/)).toBeVisible();
    const width = await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth,
    );
    expect(width).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: testInfo.outputPath('03-indicadores-celular.png'),
      fullPage: true,
    });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(
        page.getByRole('region', { name: 'Volume de registros', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('region', {
          name: 'Proporção de registros com atraso',
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth,
        ),
      ).toBeLessThanOrEqual(width);
      const lateChart = page.getByRole('region', {
        name: 'Proporção de registros com atraso',
        exact: true,
      });
      await expect(lateChart).toContainText('1 de 2 registros');
      await expect(lateChart).toContainText('50% do total');
      await expect(lateChart.locator('progress')).toHaveAttribute(
        'value',
        '50',
      );
      await expect(
        page
          .getByRole('region', { name: 'Volume de registros', exact: true })
          .locator('progress'),
      ).toHaveCount(3);
      const summary = page.getByText('Ver todos os indicadores', {
        exact: true,
      });
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('region', { name: 'Armazenamento', exact: true }),
      ).toBeVisible();
      const periodName = width === 390 ? 'Últimos 7 dias' : 'Últimos 30 dias';
      await page.getByRole('button', { name: periodName, exact: true }).click();
      await expect(
        page.getByText(new RegExp(periodName + ': de')),
      ).toBeVisible();
      await expect(
        page.getByRole('region', { name: 'Armazenamento', exact: true }),
      ).toBeVisible();
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('region', { name: 'Armazenamento', exact: true }),
      ).toBeHidden();
    }
  });
});

test('colaborador: sem a área Indicadores, e o endereço direto abre a Visão geral', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await withCatalogFixture(async ({ users, scopeA }) => {
    await page.goto('/');
    await signIn(page, users[2]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await expect(areaLink(page, 'Visão geral')).toBeVisible();
    await expect(areaLink(page, 'Indicadores')).toHaveCount(0);
    await page.goto(`/?unidade=${scopeA.establishment_id}&area=indicadores`);
    await expect(
      page.getByRole('heading', { name: 'Visão geral', level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Indicadores', level: 2 }),
    ).toHaveCount(0);
  });
});
