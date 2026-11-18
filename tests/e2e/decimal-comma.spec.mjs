import { expect, test } from '@playwright/test';
import { openArea } from './areas.mjs';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// V5 (M5, D-063): vírgula decimal nas quantidades do recebimento, da saída, de abrir/porcionar e da
// produção, com as entradas ambíguas recusadas antes de enviar. Dados sintéticos.
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

const AMBIGUOUS = /Quantidade ambígua: "1\.500" pode ser milhar ou decimal\./;
const GROUPING = /não use separador de milhar/;

test('recebimento, saída e abrir aceitam vírgula e recusam milhar e ambiguidade', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Cadastros');
    await page.getByLabel('Nome do produto').fill('Feijão de teste');
    await page.getByLabel('Unidade de medida').selectOption('kg');
    await page
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('ambient');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(
      page.getByText('Feijão de teste — kg — Ambiente'),
    ).toBeVisible();
    await page.getByLabel('Nome do fornecedor').fill('Armazém de teste');
    await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
    await openArea(page, 'Receber');
    await expect(
      page
        .getByRole('combobox', { name: 'Fornecedor', exact: true })
        .locator('option', { hasText: 'Armazém de teste' }),
    ).toHaveCount(1);
    await page
      .getByRole('combobox', { name: 'Produto', exact: true })
      .selectOption({ label: 'Feijão de teste (kg)' });
    await page
      .getByRole('combobox', { name: 'Fornecedor', exact: true })
      .selectOption({ label: 'Armazém de teste' });
    await page.getByLabel('Lote de origem').fill('V5-01');
    await page.getByLabel('Data de validade').fill('2030-01-01');
    const quantity = page.getByLabel('Quantidade recebida');
    const register = page.getByRole('button', {
      name: 'Registrar recebimento',
    });

    // Recebimento: milhar com vírgula decimal e "1.500" são recusados sem gravar.
    await quantity.fill('1.000,50');
    await register.click();
    await expect(page.getByRole('alert')).toContainText(GROUPING);
    await quantity.fill('1.500');
    await register.click();
    await expect(page.getByRole('alert')).toContainText(AMBIGUOUS);
    await expect(page.getByText('Recebimento registrado.')).toHaveCount(0);
    // "12,5" é aceito.
    await quantity.fill('12,5');
    await register.click();
    await expect(page.getByText('Recebimento registrado.')).toBeVisible();

    await openArea(page, 'Validade');
    const list = page.getByRole('list', { name: 'Recipientes e validade' });
    const card = list.getByRole('listitem').filter({ hasText: 'V5-01' });
    await expect(card).toContainText('12.5 kg');

    // Saída: "1,000.50" recusado; "0,75" vira tentativa com vírgula e grava 0.75.
    await card.getByRole('button', { name: 'Ver movimentações' }).click();
    const movements = page.getByRole('region', { name: 'Movimentações' });
    await expect(movements).toContainText(
      'Use vírgula ou ponto para decimais, por exemplo 0,5. Não use separador de milhar.',
    );
    const out = movements.getByLabel('Quantidade da saída');
    const registerOut = movements.getByRole('button', {
      name: 'Registrar saída',
    });
    await out.fill('1,000.50');
    await registerOut.click();
    await expect(movements.getByRole('alert')).toContainText(GROUPING);
    await out.fill('1.500');
    await registerOut.click();
    await expect(movements.getByRole('alert')).toContainText(AMBIGUOUS);
    await expect(movements.getByText(/Tentativa pendente/)).toHaveCount(0);
    await out.fill('0,75');
    await registerOut.click();
    await expect(
      movements.getByText('Tentativa pendente: consumo de 0,75 kg.'),
    ).toBeVisible();
    await expect(movements).toContainText(
      'Saldo após a operação, se confirmada: 11,75 kg.',
    );
    await movements.getByRole('button', { name: 'Confirmar saída' }).click();
    await expect(movements).toContainText('Saldo registrado: 11.75 kg');

    // Abrir: "1.500" recusado; "2,25" aceito, com soma e sobra em vírgula.
    await page.reload();
    await openArea(page, 'Validade');
    await card.getByRole('button', { name: 'Abrir / porcionar' }).click();
    const form = page.getByRole('region', {
      name: 'Abrir ou porcionar',
      exact: true,
    });
    const opened = form.getByLabel('Quantidade aberta (kg)');
    await form.getByLabel('Validade após a abertura').fill(localDate(5));
    await opened.fill('1.500');
    await form.getByRole('button', { name: 'Revisar registro' }).click();
    await expect(form.getByRole('alert')).toContainText(AMBIGUOUS);
    await opened.fill('2,25');
    await expect(form).toContainText(
      'Soma: 2,25 kg de 11,75 kg — sobra: 9,5 kg.',
    );
    await form.getByLabel('Sim, continua fechado').check();
    await form
      .getByLabel('Pessoa sem nome de exibição')
      .selectOption({ label: 'Você (sem nome)' });
    await form.getByLabel('Nome curto (até 40 caracteres)').fill('Ana');
    await form.getByRole('button', { name: 'Definir nome' }).click();
    await expect(form.getByLabel('Manipulado por')).toContainText('Ana');
    await form.getByRole('button', { name: 'Revisar registro' }).click();
    const review = page.getByRole('region', {
      name: 'Revisão da manipulação',
    });
    await expect(review).toContainText(
      'Abrir embalagem: 2,25 kg (total 2,25 kg)',
    );
    await review.getByRole('button', { name: 'Confirmar registro' }).click();
    await expect(
      page.getByRole('region', { name: 'Resultado da manipulação' }),
    ).toContainText('Sobra de 9.5 kg segue fechada');
  });
});

test('produção aceita vírgula e recusa entrada ambígua', async ({ page }) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Cadastros');
    const catalog = page.getByRole('region', { name: 'Preparações próprias' });
    await catalog.getByRole('button', { name: 'Nova preparação' }).click();
    await catalog.getByLabel('Nome da preparação').fill('Molho de teste');
    await catalog.getByLabel('Unidade de medida').selectOption('l');
    await catalog
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('refrigerated');
    await catalog.getByRole('button', { name: 'Cadastrar preparação' }).click();
    await expect(catalog).toContainText('Molho de teste — l — Refrigerado');
    await openArea(page, 'Produção');
    const panel = page.getByRole('region', { name: 'Produção da cozinha' });
    await panel.getByRole('button', { name: 'Registrar produção' }).click();
    const form = panel.getByRole('form', { name: 'Registrar produção' });
    await form
      .getByLabel('Preparação')
      .selectOption({ label: 'Molho de teste (l)' });
    await form.getByLabel('Validade', { exact: true }).fill(localDate(2));
    await form
      .getByLabel('Pessoa sem nome de exibição')
      .selectOption({ label: 'Você (sem nome)' });
    await form.getByLabel('Nome (até 40 caracteres)').fill('Ana Teste');
    await form.getByRole('button', { name: 'Definir nome' }).click();
    await form.getByLabel('Produzida por').selectOption({ label: 'Ana Teste' });
    const quantity = form.getByLabel('Quantidade produzida (l)');
    const review = form.getByRole('button', { name: 'Revisar produção' });
    await quantity.fill('1.000,50');
    await review.click();
    await expect(form.getByRole('alert')).toContainText(GROUPING);
    await quantity.fill('1.500');
    await review.click();
    await expect(form.getByRole('alert')).toContainText(AMBIGUOUS);
    await quantity.fill('3,5');
    await review.click();
    const check = panel.getByRole('region', { name: 'Revisão da produção' });
    await expect(check).toContainText('Quantidade: 3,5 l');
    await panel.getByRole('button', { name: 'Confirmar produção' }).click();
    await expect(
      panel.getByRole('region', { name: 'Resultado da produção' }),
    ).toBeVisible();
    await expect(
      panel.getByRole('list', { name: 'Produções recentes' }),
    ).toContainText('3.5 l');
  });
});
