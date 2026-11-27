import { expect, test } from '@playwright/test';
import { openArea, newCatalogItem } from './areas.mjs';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// Prévia da etiqueta (M9): na ficha, "Ver prévia da etiqueta" mostra o mesmo texto que o PDF imprime, com o
// aviso de que baixar não comprova impressão, e o PDF continua baixando. Dados sintéticos.
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

test('prévia da etiqueta na ficha confere com o PDF e não grava nada', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await newCatalogItem(page, 'Produtos');
    await page.getByLabel('Nome do produto').fill('Arroz de teste');
    await page.getByLabel('Unidade de medida').selectOption('kg');
    await page
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('ambient');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(
      page.getByText('Arroz de teste — kg — Ambiente'),
    ).toBeVisible();
    await newCatalogItem(page, 'Fornecedores');
    await page.getByLabel('Nome do fornecedor').fill('Horta de teste');
    await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
    await openArea(page, 'Receber');
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
    await page.getByLabel('Lote de origem').fill('C-FICHA');
    await page.getByLabel('Quantidade recebida').fill('5');
    await page.getByLabel('Data de validade').fill(localDate(-1));
    await page.getByRole('button', { name: 'Registrar recebimento' }).click();
    await expect(page.getByText('Recebimento registrado.')).toBeVisible();
    await openArea(page, 'Etiquetas');
    await page.getByRole('link', { name: 'Abrir ficha' }).first().click();
    const preview = page.getByRole('button', {
      name: 'Ver prévia da etiqueta',
    });
    await expect(preview).toBeVisible();
    await preview.click();
    const sheet = page.getByRole('group', { name: /^Etiqueta C-/ });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('RECEBIMENTO');
    await expect(sheet).toContainText('Arroz de teste');
    await expect(sheet).toContainText('Lote: C-FICHA');
    await expect(sheet).toContainText('Fornecedor: Horta de teste');
    await expect(sheet).toContainText('Conservação: Ambiente');
    await expect(
      sheet.getByRole('img', { name: /QR do recipiente/ }),
    ).toBeVisible();
    await expect(
      page.getByText(/Baixar o PDF não comprova impressão/),
    ).toBeVisible();
    // O PDF continua saindo, e fechar a prévia a esconde.
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Gerar etiqueta PDF' }).click();
    expect((await waiting).suggestedFilename()).toMatch(/\.pdf$/);
    await page.getByRole('button', { name: 'Fechar prévia' }).click();
    await expect(sheet).toHaveCount(0);
  });
});
