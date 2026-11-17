import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// Fatia 7.3: cadastrar a preparação, registrar a produção em passos (validade por extenso), ver o lote
// na lista de recipientes como "preparação própria", anular a produção e ver "ANULADO" no recipiente.
// Dados sintéticos; a unidade de teste usa America/Sao_Paulo.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Catálogo de Cozinha principal' }),
  ).toBeVisible();
}

// Baixa o PDF pelo botão e devolve os bytes; o texto desenhado em ASCII pode ser procurado neles.
async function download(page, testInfo, button, name) {
  const waiting = page.waitForEvent('download');
  await button.click();
  const file = await waiting;
  const path = testInfo.outputPath(name);
  await file.saveAs(path);
  return { bytes: await readFile(path), name: file.suggestedFilename() };
}
const has = (bytes, text) => bytes.includes(Buffer.from(text, 'latin1'));

// Cadastra a preparação e registra uma produção de 6 l com validade daqui a 2 dias.
async function produce(page) {
  await page
    .getByRole('button', { name: 'Catálogo de Cozinha principal' })
    .click();
  const catalog = page.getByRole('region', { name: 'Preparações próprias' });
  await catalog.getByRole('button', { name: 'Nova preparação' }).click();
  await catalog.getByLabel('Nome da preparação').fill('Caldo de teste');
  await catalog.getByLabel('Unidade de medida').selectOption('l');
  await catalog
    .getByRole('combobox', { name: 'Conservação', exact: true })
    .selectOption('refrigerated');
  await catalog.getByRole('button', { name: 'Cadastrar preparação' }).click();
  await expect(catalog).toContainText('Caldo de teste — l — Refrigerado');
  const panel = page.getByRole('region', { name: 'Produção da cozinha' });
  await panel.getByRole('button', { name: 'Registrar produção' }).click();
  const form = panel.getByRole('form', { name: 'Registrar produção' });
  await form
    .getByLabel('Preparação')
    .selectOption({ label: 'Caldo de teste (l)' });
  await form.getByLabel('Quantidade produzida (l)').fill('6');
  await form.getByLabel('Validade', { exact: true }).fill(localDate(2));
  await form
    .getByLabel('Pessoa sem nome de exibição')
    .selectOption({ label: 'Você (sem nome)' });
  await form.getByLabel('Nome (até 40 caracteres)').fill('Ana Teste');
  await form.getByRole('button', { name: 'Definir nome' }).click();
  await form.getByLabel('Produzida por').selectOption({ label: 'Ana Teste' });
  await form.getByRole('button', { name: 'Revisar produção' }).click();
  await panel.getByRole('button', { name: 'Confirmar produção' }).click();
  return panel;
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

test('registrar e anular produção da cozinha pela tela', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();

    const catalog = page.getByRole('region', { name: 'Preparações próprias' });
    await catalog.getByRole('button', { name: 'Nova preparação' }).click();
    await catalog.getByLabel('Nome da preparação').fill('Caldo de teste');
    await catalog.getByLabel('Unidade de medida').selectOption('l');
    await catalog
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('refrigerated');
    await catalog.getByRole('button', { name: 'Cadastrar preparação' }).click();
    await expect(catalog).toContainText('Caldo de teste — l — Refrigerado');
    // A preparação não entra no recebimento.
    await expect(
      page
        .getByRole('combobox', { name: 'Produto', exact: true })
        .locator('option', { hasText: 'Caldo de teste' }),
    ).toHaveCount(0);

    const panel = page.getByRole('region', { name: 'Produção da cozinha' });
    await expect(panel).toContainText('Nenhuma produção registrada.');
    await panel.getByRole('button', { name: 'Registrar produção' }).click();
    const form = panel.getByRole('form', { name: 'Registrar produção' });
    await form
      .getByLabel('Preparação')
      .selectOption({ label: 'Caldo de teste (l)' });
    await form.getByLabel('Quantidade produzida (l)').fill('6');
    const expiry = localDate(2);
    await form.getByLabel('Validade', { exact: true }).fill(expiry);
    // Sem nome de exibição, a pessoa é definida na própria tela.
    await form
      .getByLabel('Pessoa sem nome de exibição')
      .selectOption({ label: 'Você (sem nome)' });
    await form.getByLabel('Nome (até 40 caracteres)').fill('Ana Teste');
    await form.getByRole('button', { name: 'Definir nome' }).click();
    await expect(form.getByLabel('Produzida por')).toContainText('Ana Teste');
    await form.getByLabel('Produzida por').selectOption({ label: 'Ana Teste' });
    await form.getByRole('button', { name: 'Revisar produção' }).click();

    const review = panel.getByRole('region', { name: 'Revisão da produção' });
    const [y, m, d] = expiry.split('-');
    await expect(review).toContainText(
      new RegExp(`Validade ${d}/${m}/${y} \\(.+\\), 2 dias depois da produção`),
    );
    await expect(review).toContainText('Produzida por: Ana Teste');
    await review.getByRole('button', { name: 'Confirmar produção' }).click();
    await expect(
      panel.getByRole('region', { name: 'Resultado da produção' }),
    ).toContainText(/Produção registrada no recipiente C-\d{6}/);

    // Fatia 7.4: etiqueta "Preparação própria" do recipiente integral.
    const pdf = await download(
      page,
      testInfo,
      panel
        .getByRole('region', { name: 'Resultado da produção' })
        .getByRole('button', { name: 'Baixar etiqueta' }),
      'preparacao.pdf',
    );
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    for (const text of [
      'PREPARAÇÃO PRÓPRIA',
      'Caldo de teste',
      'VALIDADE',
      `${d}/${m}/${y}`,
      'Validade informada pelo responsável',
      'Produzido por: Ana Teste',
      'Conservação: Refrigerado',
      'Quantidade produzida: 6 l',
    ])
      expect(has(pdf.bytes, text), text).toBe(true);
    expect(has(pdf.bytes, 'RECEBIMENTO')).toBe(false);

    const productions = panel.getByRole('list', { name: 'Produções recentes' });
    await expect(productions).toContainText('Caldo de teste');
    await expect(productions).toContainText('por Ana Teste');
    const rows = page.getByRole('list', { name: 'Recipientes e validade' });
    const row = rows
      .getByRole('listitem')
      .filter({ hasText: 'Caldo de teste' });
    await expect(row).toContainText('preparação própria');
    await expect(row).toContainText('saldo 6 l de 6 l');

    // Anular: motivo obrigatório; depois o saldo é zero e a lista mostra ANULADA.
    await productions.getByRole('button', { name: 'Anular produção' }).click();
    const voidForm = panel.getByRole('form', { name: /Anular produção C-/ });
    await voidForm
      .getByLabel('Motivo da anulação')
      .fill('Validade digitada errada');
    await voidForm.getByRole('button', { name: 'Confirmar anulação' }).click();
    await expect(productions).toContainText(
      /ANULADA em .*Validade digitada errada/,
    );
    await expect(
      productions.getByRole('button', { name: 'Anular produção' }),
    ).toHaveCount(0);
    await expect(row).toHaveCount(0);
    await page.getByLabel('Mostrar esgotados').check();
    await expect(row).toContainText('saldo 0 l de 6 l');
    await row.getByRole('button', { name: 'Abrir etiqueta' }).click();
    const container = page.getByRole('region', { name: 'Recipiente' });
    await expect(container).toContainText('Preparação própria');
    await expect(container).toContainText('ANULADO');
    await expect(
      container.getByRole('button', { name: 'Gerar etiqueta PDF' }),
    ).toHaveCount(0);
  });
});

test('porções de uma preparação saem com o mesmo modelo de etiqueta', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await produce(page);
    const row = page
      .getByRole('list', { name: 'Recipientes e validade' })
      .getByRole('listitem')
      .filter({ hasText: 'Caldo de teste' });
    // Fatia 7.5: preparação só é porcionada, e a porção leva a validade do lote (sem campo de data).
    await row.getByRole('button', { name: 'Porcionar', exact: true }).click();
    const form = page.getByRole('region', { name: 'Abrir ou porcionar' });
    await expect(form).toContainText(
      'Preparação própria não é aberta: divida em porções.',
    );
    await expect(form.getByLabel('Abrir embalagem')).toBeHidden();
    await expect(form.getByLabel('Validade após a abertura')).toHaveCount(0);
    const [y, m, d] = localDate(2).split('-');
    await expect(form).toContainText(`Validade da porção: ${d}/${m}/${y}`);
    await form.getByRole('button', { name: 'Dividir igualmente' }).click();
    await form
      .getByRole('combobox', { name: 'Manipulado por' })
      .selectOption({ label: 'Ana Teste' });
    await form.getByRole('button', { name: 'Revisar registro' }).click();
    await page.getByRole('button', { name: 'Confirmar registro' }).click();
    const result = page.getByRole('region', {
      name: 'Resultado da manipulação',
    });
    await expect(result).toContainText('Porcionamento registrada');
    const pdf = await download(
      page,
      testInfo,
      result.getByRole('button', { name: 'Baixar PDF de todas' }),
      'porcoes.pdf',
    );
    for (const text of [
      'PREPARAÇÃO PRÓPRIA',
      'Produzido por: Ana Teste',
      'Quantidade da porção: 3 l',
      'Porção 1 de 2',
      'Porção 2 de 2',
    ])
      expect(has(pdf.bytes, text), text).toBe(true);
    expect(has(pdf.bytes, 'PRODUTO FRACIONADO')).toBe(false);
    // Depois do porcionamento, a produção não pode mais ser anulada (D-051).
    const productions = page
      .getByRole('region', { name: 'Produção da cozinha' })
      .getByRole('list', { name: 'Produções recentes' });
    await productions.getByRole('button', { name: 'Anular produção' }).click();
    const voidForm = page.getByRole('form', { name: /Anular produção C-/ });
    await voidForm.getByLabel('Motivo da anulação').fill('Teste');
    await voidForm.getByRole('button', { name: 'Confirmar anulação' }).click();
    await expect(voidForm.getByRole('alert')).toContainText(
      'Use o descarte com motivo.',
    );
  });
});
