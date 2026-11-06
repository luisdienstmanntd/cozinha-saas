import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

test('proprietário cadastra catálogo, troca de unidade e recupera os dados em nova sessão', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  let duplicateClientWarnings = 0;
  page.on('console', (message) => {
    if (message.text().includes('Multiple GoTrueClient instances detected'))
      duplicateClientWarnings++;
  });
  await withCatalogFixture(async ({ users }) => {
    async function signIn() {
      await page.getByLabel('E-mail').fill(users[0].email);
      await page.getByLabel('Senha').fill(users[0].password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Catálogo de Cozinha principal' }),
      ).toBeVisible();
      await expect(page.getByText('Cozinha de outra empresa')).toHaveCount(0);
    }
    await page.goto('/');
    await signIn();
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    await page.getByLabel('Nome do produto').fill('Arroz de teste');
    await page.getByLabel('Unidade de medida').selectOption('kg');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page.getByText('Arroz de teste — kg')).toBeVisible();
    await page.getByLabel('Nome do fornecedor').fill('Horta de teste');
    await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
    await expect(
      page
        .getByRole('region', { name: 'Fornecedores' })
        .getByText('Horta de teste', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('combobox', { name: 'Produto', exact: true })
        .locator('option', { hasText: 'Arroz de teste' }),
    ).toHaveCount(1);
    await expect(
      page
        .getByRole('combobox', { name: 'Fornecedor', exact: true })
        .locator('option', { hasText: 'Horta de teste' }),
    ).toHaveCount(1);
    await page
      .getByRole('combobox', { name: 'Produto', exact: true })
      .selectOption({ label: 'Arroz de teste (kg)' });
    await page
      .getByRole('combobox', { name: 'Fornecedor', exact: true })
      .selectOption({ label: 'Horta de teste' });
    await page.getByLabel('Lote de origem').fill('0001');
    await page.getByLabel('Quantidade recebida').fill('1.25');
    await page.getByLabel('Data de validade').fill('2027-01-01');
    await page.getByRole('button', { name: 'Registrar recebimento' }).click();
    await expect(page.getByText('Recebimento registrado.')).toBeVisible();
    await expect(page.getByText(/lote 0001/)).toBeVisible();
    await page.getByLabel('Nome do fornecedor').fill('HORTA DE TESTE');
    await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Esse nome já está cadastrado neste estabelecimento.',
    );
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha auxiliar' })
      .click();
    await expect(page.getByText('Nenhum produto cadastrado.')).toBeVisible();
    await expect(page.getByText('Nenhum fornecedor cadastrado.')).toBeVisible();
    await expect(page.getByText('Arroz de teste — kg')).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: 'Fornecedores' })
        .getByText('Horta de teste', { exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await signIn();
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    await expect(page.getByText('Arroz de teste — kg')).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Fornecedores' })
        .getByText('Horta de teste', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/lote 0001/)).toBeVisible();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Arroz de teste — kg')).toHaveCount(0);
  });
  expect(duplicateClientWarnings).toBe(0);
});
