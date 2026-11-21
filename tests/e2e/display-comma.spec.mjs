import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openArea, newCatalogItem } from './areas.mjs';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

// V5B (D-064): quantidades com vírgula na lista, no histórico, na ficha, na rota do QR e na etiqueta PDF,
// e temperatura do recebimento com vírgula. Produto de nome longo e valores decimais. Dados sintéticos.
const LONG_NAME = 'Açúcar integral de cozinha '.repeat(4).trim();

async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Abrir Cozinha principal' }),
  ).toBeVisible();
}

test('quantidade e temperatura decimais: vírgula na lista, histórico, ficha, QR e etiqueta PDF', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users, admin, scopeA }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await newCatalogItem(page, 'Produtos');
    await page.getByLabel('Nome do produto').fill(LONG_NAME);
    await page.getByLabel('Unidade de medida').selectOption('kg');
    await page
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('frozen');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(page.getByText(`${LONG_NAME} — kg — Congelado`)).toBeVisible();
    await newCatalogItem(page, 'Fornecedores');
    await page.getByLabel('Nome do fornecedor').fill('Granja de teste');
    await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();

    await openArea(page, 'Receber');
    await page
      .getByRole('combobox', { name: 'Produto', exact: true })
      .selectOption({ label: `${LONG_NAME} (kg)` });
    await page
      .getByRole('combobox', { name: 'Fornecedor', exact: true })
      .selectOption({ label: 'Granja de teste' });
    await page.getByLabel('Lote de origem').fill('V5B-01');
    await page.getByLabel('Quantidade recebida').fill('12,5');
    await page.getByLabel('Data de validade').fill('2030-01-01');
    await page.getByText('Temperatura medida', { exact: true }).click();
    // Texto de ajuda e validações da temperatura: vírgula aceita, limites iguais aos de sempre.
    await expect(
      page.getByText(/Use vírgula ou ponto para decimais, por exemplo -18,5\./),
    ).toBeVisible();
    const temperature = page.getByLabel('Temperatura medida, em °C');
    const register = page.getByRole('button', {
      name: 'Registrar recebimento',
    });
    for (const bad of ['80,1', '-50,1', '4,25']) {
      await temperature.fill(bad);
      await register.click();
      await expect(page.getByRole('alert')).toContainText(
        'Confira a temperatura',
      );
    }
    await expect(page.getByText('Recebimento registrado.')).toHaveCount(0);
    await temperature.fill('-18,5');
    await register.click();
    await expect(page.getByText('Recebimento registrado.')).toBeVisible();
    // Banco: o mesmo número de sempre, em ponto; nada além do que foi digitado.
    expect(
      checked(
        await admin
          .from('batch_receipts')
          .select('quantity,received_temperature_c')
          .eq('organization_id', scopeA.organization_id),
      ),
    ).toEqual([{ quantity: 12.5, received_temperature_c: -18.5 }]);

    // Lista de validade: cartão com vírgula e sem ponto decimal.
    await openArea(page, 'Validade');
    const list = page.getByRole('list', { name: 'Recipientes e validade' });
    const card = list.getByRole('listitem').filter({ hasText: 'V5B-01' });
    await expect(card).toContainText('Saldo 12,5 kg de 12,5 kg');
    await expect(card).not.toContainText(/\d\.\d/);

    // Histórico: saída de 0,25 kg.
    await card.getByRole('button', { name: 'Ver movimentações' }).click();
    const movements = page.getByRole('region', { name: 'Movimentações' });
    await expect(movements).toContainText('quantidade inicial 12,5 kg');
    await movements.getByLabel('Quantidade da saída').fill('0,25');
    await movements.getByRole('button', { name: 'Registrar saída' }).click();
    await movements.getByRole('button', { name: 'Confirmar saída' }).click();
    await expect(
      movements.getByText('Saldo registrado: 12,25 kg'),
    ).toBeVisible();
    await expect(movements.getByText(/Consumo — 0,25 kg/)).toBeVisible();
    await expect(movements).not.toContainText(/\d\.\d+ kg/);

    // Ficha e rota do QR: saldo e quantidade inicial com vírgula.
    await openArea(page, 'Validade');
    await card.getByRole('button', { name: 'Ver ficha' }).click();
    const label = page.getByRole('region', { name: 'Recipiente', exact: true });
    await expect(label.getByText('Saldo atual: 12,25 kg')).toBeVisible();
    await expect(label.getByText(/Quantidade inicial: 12,5 kg/)).toBeVisible();
    const id = (await label.getByText(/Identificação:/).innerText()).replace(
      'Identificação: ',
      '',
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    // Etiqueta PDF: vírgula, nome longo inteiro, uma página, mesmo identificador no QR/ID.
    const waiting = page.waitForEvent('download');
    await label.getByRole('button', { name: 'Gerar etiqueta PDF' }).click();
    const pdf = await waiting;
    const path = testInfo.outputPath('etiqueta-v5b.pdf');
    await pdf.saveAs(path);
    const bytes = await readFile(path);
    const text = bytes.toString('latin1');
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(text).toContain('Quantidade inicial: 12,5 kg');
    expect(text).not.toMatch(/\d\.\d+ kg/);
    expect(text).toContain(`ID: ${id}`);
    expect((text.match(/\/Type \/Page\b(?!s)/g) ?? []).length).toBe(1);
    expect(pdf.suggestedFilename()).toBe(`etiqueta-${id}.pdf`);

    // Rota do QR (/recipiente/:id): o mesmo recipiente, com a mesma vírgula.
    await page.goto(`/recipiente/${id}`);
    const resolved = page.getByRole('region', {
      name: 'Recipiente',
      exact: true,
    });
    await expect(resolved.getByText(`Identificação: ${id}`)).toBeVisible();
    await expect(resolved.getByText('Saldo atual: 12,25 kg')).toBeVisible();
    // Nada gravado mudou: o saldo guardado continua o mesmo número.
    expect(
      checked(
        await admin
          .from('batch_receipts')
          .select('quantity')
          .eq('organization_id', scopeA.organization_id),
      ),
    ).toEqual([{ quantity: 12.5 }]);
  });
});

test('produção decimal: lista e etiqueta PDF da preparação com vírgula e nome longo', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  const name = 'Açúcar integral de cozinha '.repeat(3).trim();
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Preparações próprias');
    const catalog = page.getByRole('region', {
      name: 'Preparações próprias',
      exact: true,
    });
    await catalog.getByRole('button', { name: 'Nova preparação' }).click();
    await catalog.getByLabel('Nome da preparação').fill(name);
    await catalog.getByLabel('Unidade de medida').selectOption('l');
    await catalog
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('refrigerated');
    await catalog.getByRole('button', { name: 'Cadastrar preparação' }).click();
    await expect(catalog).toContainText(`${name} — l — Refrigerado`);
    await openArea(page, 'Produção');
    const panel = page.getByRole('region', { name: 'Produção da cozinha' });
    await panel.getByRole('button', { name: 'Registrar produção' }).click();
    const form = panel.getByRole('form', { name: 'Registrar produção' });
    await form.getByLabel('Preparação').selectOption({ label: `${name} (l)` });
    await form.getByLabel('Quantidade produzida (l)').fill('2,5');
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(Date.now() + 2 * 86400000));
    await form.getByLabel('Validade', { exact: true }).fill(day);
    await form
      .getByLabel('Pessoa sem nome de exibição')
      .selectOption({ label: 'Você (sem nome)' });
    await form.getByLabel('Nome (até 40 caracteres)').fill('Ana Teste');
    await form.getByRole('button', { name: 'Definir nome' }).click();
    await form.getByLabel('Produzida por').selectOption({ label: 'Ana Teste' });
    await form.getByRole('button', { name: 'Revisar produção' }).click();
    await panel.getByRole('button', { name: 'Confirmar produção' }).click();
    const result = panel.getByRole('region', { name: 'Resultado da produção' });
    await expect(result).toBeVisible();
    const recent = panel.getByRole('list', { name: 'Produções recentes' });
    await expect(recent).toContainText('2,5 l');
    await expect(recent).not.toContainText(/\d\.\d/);

    const waiting = page.waitForEvent('download');
    await result.getByRole('button', { name: 'Baixar etiqueta' }).click();
    const file = await waiting;
    const path = testInfo.outputPath('etiqueta-producao-v5b.pdf');
    await file.saveAs(path);
    const text = (await readFile(path)).toString('latin1');
    expect(text).toContain('Quantidade produzida: 2,5 l');
    expect(text).not.toMatch(/\d\.\d+ l\b/);
    expect((text.match(/\/Type \/Page\b(?!s)/g) ?? []).length).toBe(1);
  });
});
