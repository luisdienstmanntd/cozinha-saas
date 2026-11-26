import { expect, test } from '@playwright/test';
import { openArea, newCatalogItem } from './areas.mjs';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// PR-11: a ficha aberta por Etiquetas ou pela Visão geral fica dentro da unidade (menu, endereço com
// `recipiente=`, atualizar e voltar do navegador). A rota do QR (/recipiente/:id) continua igual.
// Dados sintéticos.
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

test('ficha aberta por Etiquetas e pela Visão geral fica dentro da unidade', async ({
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

    // Etiquetas → ficha dentro da unidade.
    await openArea(page, 'Etiquetas');
    await page.getByRole('link', { name: 'Abrir ficha' }).first().click();
    const ficha = page.getByRole('region', { name: 'Recipiente', exact: true });
    await expect(ficha).toHaveAttribute('data-container-id', /^[0-9a-f-]{36}$/);
    const id = await ficha.getAttribute('data-container-id');
    expect(page.url().split('?')[0]).toMatch(/\/$/);
    expect(page.url()).toContain('area=etiquetas');
    expect(page.url()).toContain(`recipiente=${id}`);
    await expect(
      page.getByRole('navigation', { name: 'Áreas da unidade' }),
    ).toBeVisible();
    await expect(
      ficha.getByRole('button', { name: 'Gerar etiqueta PDF' }),
    ).toBeVisible();

    // Atualizar a página mantém a ficha, na mesma unidade.
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Recipiente', exact: true }),
    ).toHaveAttribute('data-container-id', id);
    await expect(
      page.getByRole('navigation', { name: 'Áreas da unidade' }),
    ).toBeVisible();

    // Voltar do navegador devolve a lista; avançar, a ficha.
    await page.goBack();
    await expect(
      page.getByRole('region', { name: 'Recipiente', exact: true }),
    ).toHaveCount(0);
    await page.goForward();
    await expect(
      page.getByRole('region', { name: 'Recipiente', exact: true }),
    ).toHaveAttribute('data-container-id', id);

    // "Voltar para a lista" e foco no link de origem.
    await page.getByRole('button', { name: '← Voltar para a lista' }).click();
    await expect(
      page.getByRole('region', { name: 'Recipiente', exact: true }),
    ).toHaveCount(0);
    expect(page.url()).not.toContain('recipiente=');
    await expect(
      page.getByRole('link', { name: 'Abrir ficha' }).first(),
    ).toBeFocused();

    // Visão geral → ficha dentro da unidade.
    await openArea(page, 'Visão geral');
    await page.getByRole('link', { name: 'Arroz de teste' }).first().click();
    await expect(
      page.getByRole('region', { name: 'Recipiente', exact: true }),
    ).toHaveAttribute('data-container-id', id);
    expect(page.url()).toContain('area=visao-geral');
    expect(page.url()).toContain(`recipiente=${id}`);

    // Trocar de área sai da ficha e limpa o endereço.
    await openArea(page, 'Etiquetas');
    await expect(
      page.getByRole('region', { name: 'Recipiente', exact: true }),
    ).toHaveCount(0);
    expect(page.url()).not.toContain('recipiente=');

    // A rota do QR continua sendo a página do recipiente, fora da lista da unidade.
    await page.goto(`/recipiente/${id}`);
    await expect(
      page.getByRole('region', { name: 'Recipiente', exact: true }),
    ).toHaveAttribute('data-container-id', id);
  });
});
