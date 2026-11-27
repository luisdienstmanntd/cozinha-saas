import { expect, test } from '@playwright/test';
import { openArea, newCatalogItem } from './areas.mjs';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// D-073 (etapa 2): baixa manual por recipiente. Exemplo do backlog: 1.000 g de peito de peru,
// consumos de 300, 500 e 200 g; saldo zero sai das validades ativas e continua no histórico.
// Também a baixa numa porção (recipiente derivado), no celular. Dados sintéticos.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Abrir Cozinha principal' }),
  ).toBeVisible();
}

// Datas relativas no fuso da unidade (lição da fatia 6.11).
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

async function receive(page, lot) {
  await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
  await newCatalogItem(page, 'Produtos');
  await page.getByLabel('Nome do produto').fill('Peito de peru de teste');
  await page.getByLabel('Unidade de medida').selectOption('g');
  await page
    .getByRole('combobox', { name: 'Conservação', exact: true })
    .selectOption('ambient');
  await page.getByRole('button', { name: 'Cadastrar produto' }).click();
  await expect(
    page.getByText('Peito de peru de teste — g — Ambiente'),
  ).toBeVisible();
  await newCatalogItem(page, 'Fornecedores');
  await page.getByLabel('Nome do fornecedor').fill('Frios de teste');
  await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
  await openArea(page, 'Receber');
  await expect(
    page
      .getByRole('combobox', { name: 'Fornecedor', exact: true })
      .locator('option', { hasText: 'Frios de teste' }),
  ).toHaveCount(1);
  await page
    .getByRole('combobox', { name: 'Produto', exact: true })
    .selectOption({ label: 'Peito de peru de teste (g)' });
  await page
    .getByRole('combobox', { name: 'Fornecedor', exact: true })
    .selectOption({ label: 'Frios de teste' });
  await page.getByLabel('Lote de origem').fill(lot);
  await page.getByLabel('Quantidade recebida').fill('1000');
  await page.getByLabel('Data de validade').fill(localDate(15));
  await page.getByRole('button', { name: 'Registrar recebimento' }).click();
  await expect(page.getByText('Recebimento registrado.')).toBeVisible();
  await openArea(page, 'Validade');
}

const board = (page) =>
  page.getByRole('region', { name: 'Painel de validade' });
const cards = (page) =>
  page
    .getByRole('list', { name: 'Recipientes e validade' })
    .getByRole('listitem');
const summary = (page) =>
  board(page).getByRole('group', { name: 'Resumo de validade' });

async function exit(movements, quantity) {
  await movements.getByLabel('Quantidade da saída').fill(quantity);
  await movements.getByRole('button', { name: 'Registrar saída' }).click();
  await movements.getByRole('button', { name: 'Confirmar saída' }).click();
}

test('peito de peru: 1000 → 700 → 200 → 0 g, recusa acima do saldo e histórico com esgotado', async ({
  page,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await receive(page, 'D073-01');
    const card = cards(page).filter({ hasText: 'D073-01' });
    await expect(card).toContainText('1000 g');
    await expect(summary(page)).toContainText('Posteriores: 1');

    await card.getByRole('button', { name: 'Ver movimentações' }).click();
    const movements = page.getByRole('region', { name: 'Movimentações' });
    await expect(movements).toContainText('Saldo registrado: 1000 g');
    await exit(movements, '300');
    await expect(movements).toContainText(
      'Saída registrada. Saldo agora: 700 g.',
    );
    await exit(movements, '500');
    await expect(movements).toContainText(
      'Saída registrada. Saldo agora: 200 g.',
    );
    await expect(movements).not.toContainText('Recipiente esgotado');

    // Acima do saldo: o banco recusa, a tela diz por quê e nada é gravado.
    await exit(movements, '300');
    await expect(movements.getByRole('alert')).toContainText(
      'a quantidade é maior que o saldo registrado deste recipiente. Nada foi gravado.',
    );
    await movements
      .getByRole('button', { name: 'Atualizar histórico' })
      .click();
    await expect(movements).toContainText('Saldo registrado: 200 g');
    await movements
      .getByRole('button', { name: 'Iniciar outra tentativa' })
      .click();

    await exit(movements, '200');
    await expect(movements).toContainText(
      'Saída registrada. Saldo agora: 0 g. Recipiente esgotado: ele sai das validades ativas e continua em "Mostrar esgotados" e no histórico.',
    );
    await expect(card).toContainText('Esgotado');
    await expect(summary(page)).toContainText('Posteriores: 0');

    // Depois de recarregar, some da lista ativa e dos contadores, antes de vencer.
    await page.reload();
    await openArea(page, 'Validade');
    await expect(summary(page)).toContainText('Posteriores: 0');
    await expect(card).toHaveCount(0);

    // "Mostrar esgotados": selo Esgotado (nunca vencido nem descartado) e histórico completo.
    await board(page).getByLabel('Mostrar esgotados').check();
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Esgotado');
    await expect(card).not.toContainText(/VENCIDO|Descartado/);
    await card.getByRole('button', { name: 'Ver movimentações' }).click();
    await expect(movements).toContainText('Saldo registrado: 0 g');
    const history = movements.getByRole('listitem');
    await expect(history).toHaveCount(3);
    await expect(history.nth(0)).toContainText('Consumo — 300 g');
    await expect(history.nth(1)).toContainText('Consumo — 500 g');
    await expect(history.nth(2)).toContainText('Consumo — 200 g');
    await expect(
      movements.getByRole('button', { name: 'Registrar saída' }),
    ).toHaveCount(1);
  });
});

test('porção (derivado) no celular: baixa no próprio recipiente, origem intacta', async ({
  page,
}) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(10000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await receive(page, 'D073-02');
    const items = cards(page).filter({ hasText: 'D073-02' });
    const origin = items.filter({ hasNotText: '(derivado)' });
    await origin.getByRole('button', { name: 'Abrir / porcionar' }).click();
    const form = page.getByRole('region', {
      name: 'Abrir ou porcionar',
      exact: true,
    });
    await form.getByLabel('Quantidade aberta (g)').fill('250');
    await form.getByLabel('Sim, continua fechado').check();
    await form.getByLabel('Validade após a abertura').fill(localDate(3));
    await form
      .getByLabel('Pessoa sem nome de exibição')
      .selectOption({ label: 'Você (sem nome)' });
    await form.getByLabel('Nome curto (até 40 caracteres)').fill('Ana');
    await form.getByRole('button', { name: 'Definir nome' }).click();
    await expect(form.getByLabel('Manipulado por')).toContainText('Ana');
    await form.getByRole('button', { name: 'Revisar registro' }).click();
    await page
      .getByRole('region', { name: 'Revisão da manipulação' })
      .getByRole('button', { name: 'Confirmar registro' })
      .click();
    const result = page.getByRole('region', {
      name: 'Resultado da manipulação',
    });
    await expect(result).toContainText('Sobra de 750 g segue fechada');
    await result.getByRole('button', { name: 'Fechar' }).click();

    // Celular: a unidade reabre na mesma área (o endereço guarda a área).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const derived = cards(page).filter({ hasText: '(derivado)' });
    await expect(derived).toContainText('Saldo 250 g');
    await expect(origin).toContainText('Saldo 750 g');
    await derived.getByRole('button', { name: 'Ver movimentações' }).click();
    const movements = derived.getByRole('region', { name: 'Movimentações' });
    await expect(movements).toContainText('Saldo registrado: 250 g');
    await exit(movements, '100');
    await expect(movements).toContainText(
      'Saída registrada. Saldo agora: 150 g.',
    );
    await exit(movements, '150');
    await expect(movements).toContainText(
      'Saída registrada. Saldo agora: 0 g. Recipiente esgotado',
    );
    await expect(derived).toContainText('Esgotado');
    await expect(origin).toContainText('Saldo 750 g');
    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth -
        globalThis.document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
