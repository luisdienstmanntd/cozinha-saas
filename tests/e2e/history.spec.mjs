import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';
import { areaLink, openArea } from './areas.mjs';

// D-079: Histórico da unidade (só leitura, com exportação em CSV). O proprietário vê os registros que o
// banco já guarda e baixa o CSV da lista mostrada; o colaborador não tem a área e o endereço direto volta
// para a Visão geral. Dados sintéticos.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Abrir Cozinha principal' }),
  ).toBeVisible();
}

async function seed(client, user, scopeA) {
  const owner = client();
  checked(
    await owner.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    }),
  );
  const ids = {
    p_organization_id: scopeA.organization_id,
    p_establishment_id: scopeA.establishment_id,
  };
  checked(
    await owner.rpc('set_member_display_name', {
      p_organization_id: scopeA.organization_id,
      p_user_id: user.id,
      p_display_name: 'Luis',
    }),
  );
  const product = checked(
    await owner
      .from('products')
      .insert({ ...scopeA, name: 'Peito de peru', unit: 'g' })
      .select('id')
      .single(),
  );
  checked(
    await owner.rpc('set_product_storage_condition', {
      ...ids,
      p_product_id: product.id,
      p_storage_condition: 'refrigerated',
    }),
  );
  const supplier = checked(
    await owner
      .from('suppliers')
      .insert({ ...scopeA, name: 'Frios Alfa' })
      .select('id')
      .single(),
  );
  const batch = checked(
    await owner.rpc('receive_batch', {
      ...ids,
      p_product_id: product.id,
      p_supplier_id: supplier.id,
      p_source_code: 'HIST-1',
      p_quantity: 1000,
      p_expiry_date: '2030-01-01',
      p_expiry_origin: 'original',
      p_original_expiry_date: '2030-01-01',
      p_storage_condition: 'refrigerated',
      p_temperature_status: 'measured',
      p_received_temperature_c: 3,
      p_temperature_reason: null,
      p_intent_id: randomUUID(),
    }),
  );
  const box = checked(
    await owner.rpc('ensure_container', { ...ids, p_batch_id: batch }),
  );
  checked(
    await owner.rpc('record_container_movement', {
      ...ids,
      p_container_id: box,
      p_kind: 'consumption',
      p_quantity: 300,
      p_reason: '=SOMA(1;1)',
      p_intent_id: randomUUID(),
    }),
  );
}

test('proprietário: histórico da unidade, filtros e CSV da lista mostrada', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await withCatalogFixture(async ({ users, client, scopeA }) => {
    await seed(client, users[0], scopeA);
    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();

    await openArea(page, 'Histórico');
    await expect(
      page.getByRole('heading', { name: 'Histórico', level: 2 }),
    ).toBeVisible();
    const list = page.getByRole('list', { name: 'Registros do histórico' });
    await expect(
      list.getByRole('listitem').filter({ hasText: 'Recebimento' }),
    ).toContainText('Peito de peru · 1000 g');
    await expect(
      list.getByRole('listitem').filter({ hasText: 'Consumo' }),
    ).toContainText('300 g');
    await expect(
      list.getByRole('listitem').filter({ hasText: 'Consumo' }),
    ).toContainText('Por Luis');
    await expect(
      list.getByRole('listitem').filter({ hasText: 'conservação' }),
    ).toContainText('Refrigerado');
    await page.screenshot({
      path: testInfo.outputPath('01-historico-desktop.png'),
      fullPage: true,
    });

    // Filtro por tipo e busca; o CSV leva só o que está na tela.
    await page.getByRole('checkbox', { name: 'Cadastro e acesso' }).uncheck();
    await page.getByRole('checkbox', { name: 'Recebimentos' }).uncheck();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^historico-cozinha-principal-\d{4}-\d{2}-\d{2}\.csv$/,
    );
    const csv = await readFile(await download.path(), 'utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Consumo;Peito de peru');
    expect(csv).toContain("'=SOMA(1;1)");
    expect(csv).not.toContain('Recebimento;');
    expect(csv.trim().split('\r\n')).toHaveLength(2);

    await page
      .getByRole('searchbox', { name: 'Buscar no histórico' })
      .fill('zzz');
    await expect(
      page.getByText('Nenhum registro com esses filtros.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Exportar CSV' }),
    ).toBeDisabled();
  });
});

test('celular: o histórico cabe na tela e abre pela folha Mais', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 390, height: 800 });
  await withCatalogFixture(async ({ users, client, scopeA }) => {
    await seed(client, users[0], scopeA);
    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Histórico');
    await expect(
      page.getByRole('list', { name: 'Registros do histórico' }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth - globalThis.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: testInfo.outputPath('02-historico-celular.png'),
      fullPage: true,
    });
  });
});

test('colaborador: sem a área Histórico, e o endereço direto abre a Visão geral', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await withCatalogFixture(async ({ users, scopeA }) => {
    await page.goto('/');
    await signIn(page, users[2]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await expect(areaLink(page, 'Visão geral')).toBeVisible();
    await expect(areaLink(page, 'Histórico')).toHaveCount(0);
    await page.goto(`/?unidade=${scopeA.establishment_id}&area=historico`);
    await expect(
      page.getByRole('heading', { name: 'Visão geral', level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Histórico', level: 2 }),
    ).toHaveCount(0);
  });
});
