import { expect, test } from '@playwright/test';
import { openArea } from './areas.mjs';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { totp } from '../../scripts/totp.mjs';

// Minha conta: trocar a senha e ativar/usar/remover o segundo fator (app autenticador) pela tela.
// Dados sintéticos; o código do aplicativo é calculado aqui a partir da chave mostrada.
async function fillCredentials(page, user, password = user.password) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test('Minha conta: troca de senha e segundo fator na entrada', async ({
  page,
}) => {
  page.setDefaultTimeout(8000);
  await withCatalogFixture(async ({ users }) => {
    const user = users[0];
    await page.goto('/');
    await fillCredentials(page, user);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Senha e acesso');
    await expect(
      page.getByRole('heading', { name: 'Senha e acesso', level: 2 }),
    ).toBeVisible();

    // Ativar o segundo fator.
    await page
      .getByRole('button', { name: 'Ativar verificação em duas etapas' })
      .click();
    const secret = (await page.locator('.account-secret').innerText()).trim();
    await expect(page.getByAltText(/QR para cadastrar/)).toBeVisible();
    await page.getByLabel('Código do aplicativo').fill('000000');
    await page.getByRole('button', { name: 'Ativar', exact: true }).click();
    await expect(page.getByText(/Código incorreto ou vencido/)).toBeVisible();
    await page.getByLabel('Código do aplicativo').fill(totp(secret));
    await page.getByRole('button', { name: 'Ativar', exact: true }).click();
    await expect(
      page.getByText(/Verificação em duas etapas ativada/),
    ).toBeVisible();

    // Sair e entrar de novo: a senha sozinha não basta.
    await page.getByText('Minha conta', { exact: true }).click();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await fillCredentials(page, user);
    await expect(
      page.getByRole('heading', { name: 'Verificação em duas etapas' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Abrir Cozinha principal' }),
    ).toHaveCount(0);
    await page.getByLabel(/Código do aplicativo/).fill('000000');
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText(/Código incorreto ou vencido/)).toBeVisible();
    await page.getByLabel(/Código do aplicativo/).fill(totp(secret));
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(
      page.getByRole('button', { name: 'Abrir Cozinha principal' }),
    ).toBeVisible();

    // Recarregar mantém a sessão completa (aal2) sem pedir o código de novo.
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Abrir Cozinha principal' }),
    ).toBeVisible();

    // Trocar a senha e remover o segundo fator.
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Senha e acesso');
    const next = `${user.password}-nova`;
    await page.getByLabel('Nova senha', { exact: true }).fill(next);
    await page.getByLabel('Repita a nova senha').fill(next);
    await page.getByRole('button', { name: 'Trocar senha' }).click();
    await expect(page.getByText(/Senha trocada/)).toBeVisible();
    await page
      .getByRole('button', { name: 'Remover verificação em duas etapas' })
      .click();
    await page.getByLabel('Código atual do aplicativo').fill(totp(secret));
    await page.getByRole('button', { name: 'Remover verificação' }).click();
    await expect(page.getByText(/Ainda não ativada/)).toBeVisible();
  });
});
