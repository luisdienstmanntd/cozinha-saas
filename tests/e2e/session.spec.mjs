import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// V2 (D-025): sessão persistente, QR sem novo login, Sair, troca de usuário e expiração.
const DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = (text) =>
  execFileSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', text], {
    encoding: 'utf8',
  }).trim();

async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Abrir Cozinha principal' }),
  ).toBeVisible();
}

test('recarregar e abrir o QR não pedem login; Sair encerra; troca de usuário não vaza dados', async ({
  page,
}) => {
  page.setDefaultTimeout(8000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await expect(
      page.getByRole('button', { name: 'Sair', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(users[0].email)).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Abrir Cozinha principal' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toHaveCount(0);

    // Rota do QR em outra carga de página no mesmo navegador: sem formulário de login.
    await page.goto('/recipiente/00000000-0000-4000-8000-000000000001');
    await expect(
      page.getByRole('button', { name: 'Sair', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        globalThis.localStorage.getItem('cozinha-saas.auth'),
      ),
    ).toBeNull();

    // Outra pessoa no mesmo aparelho: vê só a própria empresa, nada da anterior.
    await page.getByLabel('E-mail').fill(users[1].email);
    await page.getByLabel('Senha').fill(users[1].password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Empresa de teste B' }),
    ).toBeVisible();
    await expect(page.getByText('Empresa de teste A')).toHaveCount(0);
    await expect(page.getByText(users[0].email)).toHaveCount(0);
  });
});

test('sessão parada além de 30 minutos é recusada pelo servidor mesmo com a tela aberta', async ({
  page,
}) => {
  page.setDefaultTimeout(8000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    sql(
      `update private.session_activity set last_seen_at = now() - interval '31 minutes' where user_id = '${users[0].id}'`,
    );
    sql(
      `update auth.sessions set created_at = now() - interval '31 minutes' where user_id = '${users[0].id}'`,
    );
    // A tela ainda está aberta; a próxima chamada ao servidor é recusada e a sessão cai.
    await page.getByRole('button', { name: 'Atualizar acesso' }).click();
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('inatividade');
    await expect(page.getByText('Empresa de teste A')).toHaveCount(0);
  });
});

test('relógio do navegador além de 30 minutos encerra a sessão ao recarregar', async ({
  page,
}) => {
  page.setDefaultTimeout(8000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page.evaluate(() =>
      globalThis.localStorage.setItem(
        'cozinha-saas.last-activity',
        String(Date.now() - 31 * 60 * 1000),
      ),
    );
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('inatividade');
  });
});
