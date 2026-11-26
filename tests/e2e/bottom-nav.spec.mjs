import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// PR-12 (D-078): no celular e no tablet em pé a navegação da unidade é uma barra inferior com 4
// atalhos e "Mais". No notebook continua o menu lateral. Dados sintéticos.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Abrir Cozinha principal' }),
  ).toBeVisible();
}
const openUnit = (page) =>
  page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
const bar = (page) =>
  page.getByRole('navigation', { name: 'Áreas da unidade' });
const sheet = (page) => page.getByRole('dialog', { name: 'Mais áreas' });
const names = (locator) =>
  locator
    .getByRole('link')
    .evaluateAll((links) =>
      links.map((link) => link.getAttribute('aria-label')),
    );

test('proprietário no celular: 4 atalhos em um toque, Mais com foco, Escape e atualizar a página', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await signIn(page, users[0]);
    await openUnit(page);

    await expect(
      page.getByRole('button', { name: 'Menu', exact: true }),
    ).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
    expect(await names(bar(page))).toEqual([
      'Visão geral',
      'Validades',
      'Produção',
      'Etiquetas',
    ]);
    // A barra fica colada no fim da tela e cada alvo tem pelo menos 44 px.
    const box = await bar(page).boundingBox();
    expect(Math.round(box.y + box.height)).toBe(844);
    for (const control of await bar(page).locator('a, button').all()) {
      const rect = await control.boundingBox();
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.width).toBeGreaterThanOrEqual(44);
    }

    // Um toque troca de área, e o endereço acompanha.
    for (const [name, area] of [
      ['Validades', 'validade'],
      ['Produção', 'producao'],
      ['Etiquetas', 'etiquetas'],
      ['Visão geral', 'visao-geral'],
    ]) {
      await bar(page).getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`area=${area}$`));
      await expect(
        bar(page).getByRole('link', { name, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }

    // Mais: folha com as demais áreas, foco dentro, Escape fecha e devolve o foco.
    const more = bar(page).getByRole('button', { name: 'Mais', exact: true });
    await more.click();
    await expect(sheet(page)).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(await names(sheet(page))).toEqual([
      'Indicadores',
      'Recebimentos',
      'Locais de armazenamento',
      'Produtos',
      'Fornecedores',
      'Preparações próprias',
      'Unidade',
      'Equipe',
      'Organização',
    ]);
    await expect(sheet(page).locator(':focus')).toHaveCount(1);
    for (const link of await sheet(page).getByRole('link').all()) {
      const rect = await link.boundingBox();
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    // O foco não escapa da folha com Tab.
    for (let index = 0; index < 14; index += 1) {
      await page.keyboard.press('Tab');
      await expect(sheet(page).locator(':focus')).toHaveCount(1);
    }
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(more).toBeFocused();

    // Área escolhida em Mais: a folha fecha, o foco vai ao conteúdo e a barra marca Mais.
    await more.click();
    await sheet(page)
      .getByRole('link', { name: 'Produtos', exact: true })
      .click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page).toHaveURL(/area=produtos$/);
    await expect(
      page.getByRole('heading', { name: 'Produtos', exact: true }),
    ).toBeVisible();
    await expect(more).toHaveClass(/is-current/);

    // Atualizar a página e voltar do navegador mantêm a área e a barra.
    await page.reload();
    await expect(bar(page)).toBeVisible();
    await expect(page).toHaveURL(/area=produtos$/);
    await expect(
      page.getByRole('heading', { name: 'Produtos', exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/area=visao-geral$/);
    await expect(
      bar(page).getByRole('link', { name: 'Visão geral', exact: true }),
    ).toHaveAttribute('aria-current', 'page');

    // O fim do conteúdo não fica escondido atrás da barra, nem há rolagem lateral.
    await bar(page)
      .getByRole('link', { name: 'Validades', exact: true })
      .click();
    await page.evaluate(() =>
      globalThis.window.scrollTo(0, globalThis.document.body.scrollHeight),
    );
    // O espaço reservado no fim do conteúdo (padding) cobre a altura da barra.
    const content = await page.locator('.unit-layout').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const padding = parseFloat(
        globalThis.getComputedStyle(element).paddingBottom,
      );
      return { bottom: rect.bottom, padding };
    });
    const barBox = await bar(page).boundingBox();
    expect(content.padding).toBeGreaterThanOrEqual(barBox.height);
    expect(content.bottom - content.padding).toBeLessThanOrEqual(barBox.y + 1);
    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth -
        globalThis.document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test('colaborador no celular só vê as áreas do perfil; Sair continua à vista', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await signIn(page, users[2]);
    await openUnit(page);
    expect(await names(bar(page))).toEqual([
      'Visão geral',
      'Validades',
      'Produção',
      'Etiquetas',
    ]);
    await bar(page).getByRole('button', { name: 'Mais', exact: true }).click();
    expect(await names(sheet(page))).toEqual([
      'Locais de armazenamento',
      'Unidade',
    ]);
    for (const hidden of [
      'Recebimentos',
      'Produtos',
      'Indicadores',
      'Organização',
    ])
      await expect(
        page.getByRole('link', { name: hidden, exact: true }),
      ).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Pedir uma área que o perfil não tem pelo endereço continua caindo na Visão geral.
    await page.goto(`${page.url().split('&area=')[0]}&area=receber`);
    await expect(
      bar(page).getByRole('link', { name: 'Visão geral', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page.getByText('Minha conta', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  });
});

test('tablet em pé usa a barra inferior e o notebook mantém o menu lateral', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await signIn(page, users[0]);
    await openUnit(page);
    await expect(page.locator('.mesa-bottom-nav')).toBeVisible();
    await expect(page.locator('.mesa-sidebar')).toHaveCount(0);

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('.mesa-bottom-nav')).toHaveCount(0);
    await expect(page.locator('.mesa-sidebar')).toBeVisible();
    await expect(
      bar(page).getByRole('link', { name: 'Visão geral', exact: true }),
    ).toHaveAttribute('aria-current', 'page');

    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(page.locator('.mesa-bottom-nav')).toHaveCount(0);
    await expect(page.locator('.mesa-sidebar')).toBeVisible();
  });
});
