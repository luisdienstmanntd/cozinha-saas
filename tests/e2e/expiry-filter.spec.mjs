import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';
import { openArea } from './areas.mjs';

// V6 (D-072): os contadores de validade filtram a lista. O servidor começa a lista na categoria (cursor)
// e a interface corta o fim; o filtro fica no endereço. Dados sintéticos; datas no fuso da unidade
// (America/Sao_Paulo). Nenhum texto avalia o alimento.
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

function psql(sql) {
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_cozinha-saas',
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
    ],
    { input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

// Recebimentos por categoria: 2 vencidos, 102 de hoje (atravessa a página de 100), 1 de amanhã e 1
// posterior. Cada recebimento gera um recipiente com saldo.
async function seed(admin, scopeA, user) {
  const product = checked(
    await admin
      .from('products')
      .insert({ ...scopeA, name: 'Produto filtro', unit: 'kg' })
      .select('id')
      .single(),
  );
  const supplier = checked(
    await admin
      .from('suppliers')
      .insert({ ...scopeA, name: 'Fornecedor filtro' })
      .select('id')
      .single(),
  );
  const ids = [
    scopeA.organization_id,
    scopeA.establishment_id,
    user.id,
    product.id,
    supplier.id,
  ];
  if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id)))
    throw new Error('Identificador de teste inválido.');
  const [org, unit, userId, productId, supplierId] = ids;
  const groups = [
    ['VENC', localDate(-3), 2],
    ['HOJE', localDate(0), 102],
    ['AMANHA', localDate(1), 1],
    ['DEPOIS', localDate(9), 1],
  ];
  const sql = groups
    .map(([code, date, count]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data inválida.');
      return `insert into public.batch_receipts(organization_id,establishment_id,product_id,supplier_id,intent_id,source_code,quantity,unit,expiry_date,expiry_origin,original_expiry_date,timezone,created_by)
        select '${org}','${unit}','${productId}','${supplierId}',gen_random_uuid(),'${code}-'||lpad(n::text,3,'0'),1,'kg','${date}','original','${date}','America/Sao_Paulo','${userId}' from generate_series(1,${count}) n;`;
    })
    .join('\n');
  psql(sql);
}

async function signIn(page, user) {
  await page.goto('/');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
}

const list = (page) =>
  page.getByRole('list', { name: 'Recipientes e validade' });
const items = (page) => list(page).getByRole('listitem');
const tiles = (page) =>
  page
    .getByRole('region', { name: 'Painel de validade' })
    .getByRole('group', { name: 'Resumo de validade' });
const tile = (page, name) =>
  tiles(page).getByRole('button', { name: new RegExp(`^${name}`) });

test('proprietário: contadores filtram Validades, pela Visão geral, após recarregar e ao voltar', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await withCatalogFixture(async ({ admin, users, scopeA }) => {
    await seed(admin, scopeA, users[0]);
    await signIn(page, users[0]);

    // Visão geral: o contador "Vencem hoje" leva a Validades já filtrada.
    const overview = page.getByRole('region', {
      name: 'Recipientes com saldo por validade',
    });
    await overview.getByRole('link', { name: /Vencem hoje\s*102/ }).click();
    await expect(page).toHaveURL(/area=validade&validade=hoje/);
    await expect(tile(page, 'Vence hoje')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      page.getByText(/Mostrando: Vence hoje \(102 com saldo na unidade\)/),
    ).toBeVisible();
    await expect(items(page)).toHaveCount(100);
    await page
      .getByRole('region', { name: 'Painel de validade' })
      .screenshot({ path: testInfo.outputPath('01-filtro-hoje.png') });
    const more = page.getByRole('button', {
      name: 'Carregar mais recipientes',
    });
    await more.click();
    await expect(items(page)).toHaveCount(102);
    await expect(more).toHaveCount(0);
    await expect(list(page).getByText(/AMANHA-|VENC-|DEPOIS-/)).toHaveCount(0);

    // Recarregar mantém o filtro.
    await page.reload();
    await expect(tile(page, 'Vence hoje')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(items(page)).toHaveCount(100);

    // Outro contador troca o filtro; voltar no navegador devolve o anterior.
    await tile(page, 'Vencidos').click();
    await expect(page).toHaveURL(/validade=vencidos/);
    await expect(items(page)).toHaveCount(2);
    await expect(list(page).getByText(/VENC-00[12]/)).toHaveCount(2);
    await page.goBack();
    await expect(page).toHaveURL(/validade=hoje/);
    await expect(tile(page, 'Vence hoje')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await tile(page, 'Vence amanhã').click();
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toContainText('AMANHA-001');
    await tile(page, 'Posteriores').click();
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toContainText('DEPOIS-001');

    // Limpar o filtro volta à lista completa e tira o filtro do endereço.
    await page.getByRole('button', { name: 'Limpar filtro' }).click();
    await expect(page).not.toHaveURL(/validade=/);
    await expect(items(page)).toHaveCount(100);
    await expect(items(page).first()).toContainText('VENC-');

    // Trocar de área não leva o filtro junto.
    await tile(page, 'Vencidos').click();
    await expect(page).toHaveURL(/validade=vencidos/);
    await openArea(page, 'Produção');
    await expect(page).not.toHaveURL(/validade=/);
    await openArea(page, 'Validade');
    await expect(page.getByText(/Mostrando:/)).toHaveCount(0);
    await expect(items(page)).toHaveCount(100);
  });
});

test('colaborador no celular: filtra pelos contadores sem rolagem horizontal', async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  await withCatalogFixture(async ({ admin, users, scopeA }) => {
    await seed(admin, scopeA, users[0]);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await signIn(page, users[2]);
      await openArea(page, 'Validade');
      await tile(page, 'Vencidos').click();
      await expect(tile(page, 'Vencidos')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(items(page)).toHaveCount(2);
      const box = await tile(page, 'Vencidos').boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      const overflow = await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth >
          globalThis.document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
      await page
        .getByRole('region', { name: 'Painel de validade' })
        .screenshot({
          path: testInfo.outputPath(`02-colaborador-${width}.png`),
        });
      // Sai para a próxima largura entrar do zero.
      await page.context().clearCookies();
      await page.evaluate(() => {
        globalThis.localStorage.clear();
        globalThis.sessionStorage.clear();
      });
    }
  });
});
