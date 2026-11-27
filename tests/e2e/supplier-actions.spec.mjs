import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';
import { openArea } from './areas.mjs';

for (const width of [1280, 390]) {
  test(`fornecedores: editar, cancelar exclusão e excluir em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await withCatalogFixture(async ({ admin, users, scopeA }) => {
      checked(
        await admin
          .from('suppliers')
          .insert({ ...scopeA, name: 'Horta inicial' }),
      );
      await page.goto('/');
      await page.getByLabel('E-mail', { exact: true }).fill(users[0].email);
      await page.getByLabel('Senha', { exact: true }).fill(users[0].password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page
        .getByRole('button', { name: 'Abrir Cozinha principal' })
        .click();
      await openArea(page, 'Fornecedores');
      const edit = page.getByRole('button', {
        name: 'Editar fornecedor Horta inicial',
        exact: true,
      });
      const box = await edit.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      await page.getByLabel('Pesquisar fornecedores').fill('inicial');
      await edit.click();
      const drawer = page.getByRole('dialog', {
        name: 'Editar fornecedor',
        exact: true,
      });
      await drawer.getByLabel('Nome do fornecedor').fill('Horta revisada');
      await drawer
        .getByLabel('E-mail (opcional)', { exact: true })
        .fill('compras@example.test');
      await drawer.getByRole('button', { name: 'Salvar alterações' }).click();
      await expect(drawer).not.toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Fornecedores', exact: true }),
      ).toBeFocused();
      await page.getByLabel('Pesquisar fornecedores').fill('');
      await page.reload();
      await expect(
        page.getByText('compras@example.test', { exact: true }),
      ).toBeVisible();
      const remove = page.getByRole('button', {
        name: 'Excluir fornecedor Horta revisada',
        exact: true,
      });
      await remove.click();
      const confirmation = page.getByRole('dialog', {
        name: 'Excluir fornecedor Horta revisada?',
      });
      await expect(
        confirmation.getByRole('button', { name: 'Cancelar', exact: true }),
      ).toBeFocused();
      await confirmation
        .getByRole('button', { name: 'Cancelar', exact: true })
        .click();
      await expect(remove).toBeFocused();
      await remove.click();
      await confirmation
        .getByRole('button', { name: 'Excluir fornecedor', exact: true })
        .click();
      await expect(
        page.getByText('Nenhum fornecedor cadastrado.'),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByText('Nenhum fornecedor cadastrado.'),
      ).toBeVisible();
    });
  });
}
