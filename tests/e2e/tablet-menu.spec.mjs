import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// PR-13: em tablet deitado (900 a 1199 px) o menu lateral começa recolhido, com alvos de 44 px, e a
// escolha de expandir é lembrada por pessoa neste aparelho. No notebook começa expandido.
// Dados sintéticos.
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
const sidebar = (page) => page.locator('.mesa-sidebar').first();
const width = async (locator) => (await locator.boundingBox()).width;
const nav = (page) =>
  page.getByRole('navigation', { name: 'Áreas da unidade' });

// Tablet tem toque (pointer: coarse): ali valem os alvos de 44 px (com mouse o menu usa itens de 36 px
// para caber em 1366×768, PR-01).
test.describe('tablet com toque', () => {
  test.use({ hasTouch: true });

  test('tablet deitado 1024×768: menu recolhido por padrão, alvos de 44 px e escolha lembrada', async ({
    page,
  }) => {
    page.setDefaultTimeout(5000);
    await withCatalogFixture(async ({ users }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/');
      await signIn(page, users[0]);
      await openUnit(page);
      expect(
        await page.evaluate(
          () => globalThis.matchMedia('(pointer: coarse)').matches,
        ),
      ).toBe(true);

      await expect(sidebar(page)).toHaveClass(/is-compact/);
      expect(await width(sidebar(page))).toBeLessThan(100);
      // Recolhido, os links seguem acessíveis pelo nome e com alvo de toque de 44 px.
      await expect(
        nav(page).getByRole('link', { name: 'Validades', exact: true }),
      ).toBeVisible();
      for (const link of await nav(page).getByRole('link').all()) {
        const rect = await link.boundingBox();
        expect(rect.height).toBeGreaterThanOrEqual(44);
        expect(rect.width).toBeGreaterThanOrEqual(44);
      }
      const toggle = page.getByRole('button', { name: 'Expandir menu' });
      const toggleBox = await toggle.boundingBox();
      expect(toggleBox.height).toBeGreaterThanOrEqual(44);
      expect(toggleBox.width).toBeGreaterThanOrEqual(44);
      // O conteúdo aproveita a largura que sobrou e nada rola para o lado.
      const compactContent = await width(page.locator('.unit-content'));
      const overflow = await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth -
          globalThis.document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      // Trocar de área pelo menu recolhido funciona.
      await nav(page)
        .getByRole('link', { name: 'Validades', exact: true })
        .click();
      await expect(page).toHaveURL(/area=validade$/);

      // Expandir mostra os nomes e fica lembrado depois de atualizar a página.
      await toggle.click();
      await expect(sidebar(page)).not.toHaveClass(/is-compact/);
      expect(await width(sidebar(page))).toBeGreaterThan(180);
      expect(await width(page.locator('.unit-content'))).toBeLessThan(
        compactContent,
      );
      await page.reload();
      await expect(sidebar(page)).not.toHaveClass(/is-compact/);
      await expect(
        page.getByRole('button', { name: 'Recolher menu' }),
      ).toBeVisible();

      // Recolher de novo também é lembrado.
      await page.getByRole('button', { name: 'Recolher menu' }).click();
      await page.reload();
      await expect(sidebar(page)).toHaveClass(/is-compact/);
    });
  });
});

test('notebook começa expandido; outra pessoa no mesmo aparelho recebe o padrão do tablet', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await signIn(page, users[0]);
    await openUnit(page);
    await expect(sidebar(page)).not.toHaveClass(/is-compact/);
    expect(await width(sidebar(page))).toBeGreaterThan(180);

    // Em tablet, a primeira pessoa expande e sai.
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(sidebar(page)).toHaveClass(/is-compact/);
    await page.getByRole('button', { name: 'Expandir menu' }).click();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();

    // Outra pessoa, no mesmo aparelho, recebe o padrão (recolhido) e não herda a escolha.
    await signIn(page, users[2]);
    await openUnit(page);
    await expect(sidebar(page)).toHaveClass(/is-compact/);
  });
});
