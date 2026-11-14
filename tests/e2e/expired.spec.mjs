import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// Fatia 6.11: recipiente vencido com saldo mostra a faixa VENCIDO no painel e na tela do recipiente
// (QR), o formulário só oferece descarte e o descarte é registrado. Dados sintéticos; a data de
// "ontem" é a da unidade (America/Sao_Paulo). Nenhum texto avalia o alimento.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Catálogo de Cozinha principal' }),
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

async function receive(page, code, expiry) {
  await page
    .getByRole('combobox', { name: 'Produto', exact: true })
    .selectOption({ label: 'Arroz de teste (kg)' });
  await page
    .getByRole('combobox', { name: 'Fornecedor', exact: true })
    .selectOption({ label: 'Horta de teste' });
  await page.getByLabel('Lote de origem').fill(code);
  await page.getByLabel('Quantidade recebida').fill('5');
  await page.getByLabel('Data de validade').fill(expiry);
  await page.getByRole('button', { name: 'Registrar recebimento' }).click();
  await expect(page.getByText('Recebimento registrado.')).toBeVisible();
}

test('vencido: faixa no painel e no QR, consumo indisponível e descarte registrado', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    await page.getByLabel('Nome do produto').fill('Arroz de teste');
    await page.getByLabel('Unidade de medida').selectOption('kg');
    await page
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('ambient');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(
      page.getByText('Arroz de teste — kg — Ambiente'),
    ).toBeVisible();
    await page.getByLabel('Nome do fornecedor').fill('Horta de teste');
    await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
    await expect(
      page
        .getByRole('combobox', { name: 'Fornecedor', exact: true })
        .locator('option', { hasText: 'Horta de teste' }),
    ).toHaveCount(1);
    await receive(page, 'V-ONTEM', localDate(-1));
    await receive(page, 'V-HOJE', localDate(0));

    const rows = page.getByRole('list', { name: 'Recipientes e validade' });
    const expired = rows.getByRole('listitem').filter({ hasText: 'V-ONTEM' });
    const today = rows.getByRole('listitem').filter({ hasText: 'V-HOJE' });
    await expect(expired.getByText(/VENCIDO - somente descarte/)).toBeVisible();
    await expect(today.getByText(/VENCIDO/)).toHaveCount(0);
    await expect(
      expired.getByRole('button', { name: 'Abrir / porcionar' }),
    ).toHaveCount(0);
    await expect(
      today.getByRole('button', { name: 'Abrir / porcionar' }),
    ).toBeVisible();
    await rows.screenshot({
      path: testInfo.outputPath('01-painel-vencido.png'),
    });

    // Só descarte no vencido; o descarte é registrado e baixa o saldo.
    await expired.getByRole('button', { name: 'Ver movimentações' }).click();
    const panel = expired.getByRole('region', { name: 'Movimentações' });
    await expect(panel.getByText('VENCIDO - somente descarte')).toBeVisible();
    await expect(
      panel.getByLabel('Tipo de saída').locator('option'),
    ).toHaveText(['Descarte']);
    await panel.getByLabel('Quantidade da saída').fill('2');
    await panel.getByLabel('Motivo', { exact: true }).fill('Validade passou');
    await panel.getByRole('button', { name: 'Registrar saída' }).click();
    await panel.getByRole('button', { name: 'Confirmar saída' }).click();
    await expect(panel.getByText(/Descarte — 2 kg/)).toBeVisible();
    await expect(expired).toContainText('saldo 3 kg');
    await expired.screenshot({
      path: testInfo.outputPath('02-descarte-vencido.png'),
    });

    // Tela do recipiente (a mesma do QR).
    await expired.getByRole('button', { name: 'Abrir etiqueta' }).click();
    const label = page.getByRole('region', { name: 'Recipiente', exact: true });
    await expect(label.getByText('VENCIDO - somente descarte')).toBeVisible();
    await expect(
      label.getByText(/O consumo é recusado; o descarte continua permitido/),
    ).toBeVisible();
    await expect(
      label.getByText('Manipulação indisponível: validade passou.'),
    ).toBeVisible();
    await expect(
      label.getByRole('button', { name: 'Abrir / porcionar' }),
    ).toHaveCount(0);
    await label.screenshot({ path: testInfo.outputPath('03-qr-vencido.png') });
  });
});
