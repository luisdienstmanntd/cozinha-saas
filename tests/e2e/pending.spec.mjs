import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// Fatia 6.8, E2E 34 do desenho: fechar a aba com resultado incerto, reabrir e confirmar sem duplicar.
// A falha é simulada na rede do navegador: a resposta se perde (o servidor gravou) ou o pedido nem
// chega (o servidor não gravou). Recarregar encerra a sessão (ela não é persistida), então a
// tentativa pendente só pode vir do localStorage.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Catálogo de Cozinha principal' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Catálogo de Cozinha principal' })
    .click();
}

async function prepare(page) {
  await page.getByLabel('Nome do produto').fill('Arroz de teste');
  await page.getByLabel('Unidade de medida').selectOption('kg');
  await page
    .getByRole('combobox', { name: 'Conservação', exact: true })
    .selectOption('ambient');
  await page.getByRole('button', { name: 'Cadastrar produto' }).click();
  await expect(page.getByText('Arroz de teste — kg — Ambiente')).toBeVisible();
  await page.getByLabel('Nome do fornecedor').fill('Horta de teste');
  await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
  await expect(
    page
      .getByRole('combobox', { name: 'Fornecedor', exact: true })
      .locator('option', { hasText: 'Horta de teste' }),
  ).toHaveCount(1);
}

async function fillReceipt(page) {
  await page
    .getByRole('combobox', { name: 'Produto', exact: true })
    .selectOption({ label: 'Arroz de teste (kg)' });
  await page
    .getByRole('combobox', { name: 'Fornecedor', exact: true })
    .selectOption({ label: 'Horta de teste' });
  await page.getByLabel('Lote de origem').fill('E34');
  await page.getByLabel('Quantidade recebida').fill('7');
  await page.getByLabel('Data de validade').fill('2030-01-01');
}

for (const [name, serverSaves, expected] of [
  ['resposta perdida: o servidor gravou', true, 'Registro confirmado'],
  [
    'pedido perdido: o servidor não gravou',
    false,
    'O servidor não tem este registro',
  ],
]) {
  test(`E2E 34, ${name}: reabrir confere no servidor e não duplica`, async ({
    page,
  }) => {
    page.setDefaultTimeout(5000);
    await withCatalogFixture(async ({ users }) => {
      await page.goto('/');
      await signIn(page, users[0]);
      await prepare(page);
      await fillReceipt(page);
      await page.route('**/rest/v1/rpc/receive_batch', async (route) => {
        if (serverSaves) await route.fetch();
        await route.abort('failed');
      });
      await page.getByRole('button', { name: 'Registrar recebimento' }).click();
      await expect(page.getByRole('alert')).toContainText(
        'Não foi possível registrar o recebimento',
      );
      // "Fecha a aba": recarregar descarta a sessão e a tela; fica só o localStorage.
      await page.unroute('**/rest/v1/rpc/receive_batch');
      await page.reload();
      await signIn(page, users[0]);
      const banner = page.getByRole('region', {
        name: 'Registros não confirmados',
      });
      await expect(banner).toContainText('Há 1 registro não confirmado');
      await expect(banner).toContainText('Recebimento do lote E34 (7)');
      await expect(banner).toContainText(expected);
      const rows = page.getByRole('list', { name: 'Recipientes e validade' });
      if (serverSaves) {
        // Nada é enviado de novo: continua um único recebimento.
        await expect(rows.getByText(/lote E34/)).toHaveCount(1);
        await expect(
          banner.getByRole('button', { name: 'Enviar novamente' }),
        ).toHaveCount(0);
        await banner.getByRole('button', { name: 'Entendi' }).click();
      } else {
        await expect(
          page.getByText('Nenhum recipiente com saldo.'),
        ).toBeVisible();
        await banner.getByRole('button', { name: 'Enviar novamente' }).click();
        await expect(
          page.getByText('Registro enviado e confirmado.'),
        ).toBeVisible();
        await expect(rows.getByText(/lote E34/)).toHaveCount(1);
      }
      await expect(banner).toHaveCount(0);
      // Recarregar de novo: nada pendente, nenhum registro a mais.
      await page.reload();
      await signIn(page, users[0]);
      await expect(
        page.getByRole('region', { name: 'Registros não confirmados' }),
      ).toHaveCount(0);
      await expect(
        page
          .getByRole('list', { name: 'Recipientes e validade' })
          .getByText(/lote E34/),
      ).toHaveCount(1);
    });
  });
}

test('descartar tentativa que o servidor não tem', async ({ page }) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await prepare(page);
    await fillReceipt(page);
    await page.route('**/rest/v1/rpc/receive_batch', (route) =>
      route.abort('failed'),
    );
    await page.getByRole('button', { name: 'Registrar recebimento' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.unroute('**/rest/v1/rpc/receive_batch');
    await page.reload();
    await signIn(page, users[0]);
    const banner = page.getByRole('region', {
      name: 'Registros não confirmados',
    });
    await banner.getByRole('button', { name: 'Descartar tentativa' }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.getByText('Nenhum recipiente com saldo.')).toBeVisible();
    // Outro usuário no mesmo navegador não vê tentativas alheias.
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await signIn(page, users[2]);
    await expect(
      page.getByRole('region', { name: 'Registros não confirmados' }),
    ).toHaveCount(0);
  });
});
