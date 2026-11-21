import { expect, test } from '@playwright/test';
import { openArea, newCatalogItem } from './areas.mjs';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// V3: lista de validade em cartões. Selo com texto (não só cor), datas dd/mm/aaaa, nenhum UUID na
// lista, ficha aberta pelo cartão (também pelo colaborador, só leitura) e leitura no celular.
// Dados sintéticos; as datas são relativas ao dia da unidade (America/Sao_Paulo).
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
const br = (iso) => iso.split('-').reverse().join('/');

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

test('cartões de validade legíveis no celular e ficha aberta pelo colaborador', async ({
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
    await receive(page, 'C-ONTEM', localDate(-1));
    await receive(page, 'C-HOJE', localDate(0));
    await receive(page, 'C-DEZ', localDate(10));
    await page.getByRole('button', { name: 'Sair', exact: true }).click();

    // Colaborador, celular.
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, users[2]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Validade');
    const list = page.getByRole('list', { name: 'Recipientes e validade' });
    const card = (code) => list.getByRole('listitem').filter({ hasText: code });
    await expect(card('C-ONTEM')).toContainText('Vencido há 1 dia');
    await expect(card('C-ONTEM')).toContainText('VENCIDO - somente descarte');
    await expect(card('C-HOJE')).toContainText('Vence hoje');
    await expect(card('C-DEZ')).toContainText('Vence em 10 dias');
    await expect(card('C-DEZ')).toContainText(
      `Validade ${br(localDate(10))} (original)`,
    );
    await expect(card('C-DEZ')).toContainText('Saldo 5 kg de 5 kg');
    // Ordem por validade e nenhum UUID nem data ISO na lista.
    await expect(list.getByRole('listitem').first()).toContainText('C-ONTEM');
    const text = await list.innerText();
    expect(text).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // Selo, validade e saldo do primeiro cartão ficam lado a lado em uma tela de celular.
    const first = list.getByRole('listitem').first();
    // Ao abrir a unidade no celular, o primeiro cartão (o mais urgente) já aparece na primeira tela.
    await expect(first.getByText('Vencido há 1 dia')).toBeInViewport();
    await first.scrollIntoViewIfNeeded();
    const height = await first.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBeLessThan(260);
    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth -
        globalThis.document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // Ficha pelo cartão: o colaborador lê, sem ações de escrita.
    const open = card('C-DEZ').getByRole('button', { name: 'Ver ficha' });
    await open.click();
    const ficha = page.getByRole('region', { name: 'Recipiente', exact: true });
    await expect(
      ficha.getByText(/^Identificação: [0-9a-f-]{36}$/),
    ).toBeVisible();
    await expect(ficha.getByText('Vence em 10 dias')).toBeVisible();
    await expect(ficha).toContainText(`validade ${br(localDate(10))}`);
    await expect(
      ficha.getByText('Somente o proprietário abre, porciona ou anula.'),
    ).toBeVisible();
    await expect(list).toBeHidden();
    await page.getByRole('button', { name: '← Voltar para a lista' }).click();
    await expect(list).toBeVisible();
    await expect(open).toBeFocused();
    await expect(
      page.getByRole('region', { name: 'Recipiente', exact: true }),
    ).toHaveCount(0);
  });
});
