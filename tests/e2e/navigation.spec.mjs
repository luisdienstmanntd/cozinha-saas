import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { areaLink, openArea } from './areas.mjs';

// V1: a unidade aberta se divide em cinco áreas, com menu lateral (desktop) e barra inferior
// (celular). Permissão continua no banco; aqui só se confere o que cada perfil vê e que nada
// digitado se perde ao trocar de área.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Abrir Cozinha principal' }),
  ).toBeVisible();
}
const openUnit = (page) =>
  page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
const nav = (page) =>
  page.getByRole('navigation', { name: 'Áreas da unidade' });

test('proprietário: cinco áreas, Validade ao abrir, unidade, usuário e Sair sempre à vista', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await openUnit(page);
    await expect(nav(page).getByRole('link')).toHaveText([
      'Validade',
      'Receber',
      'Produção',
      'Locais',
      'Cadastros',
    ]);
    await expect(areaLink(page, 'Validade')).toHaveAttribute(
      'aria-current',
      'page',
    );
    const bar = page.getByRole('region', { name: 'Sessão' });
    for (const name of [
      'Validade',
      'Receber',
      'Produção',
      'Locais',
      'Cadastros',
    ]) {
      await openArea(page, name);
      await expect(areaLink(page, name)).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(bar).toContainText('Cozinha principal');
      await expect(bar).toContainText(users[0].email);
      await expect(bar.getByRole('button', { name: 'Sair' })).toBeVisible();
      // Só a área escolhida mostra seus formulários.
      await expect(page.getByRole('link', { name })).toBeVisible();
    }
    // Validade: lista e painel; sem formulários de outras áreas à vista.
    await openArea(page, 'Validade');
    await expect(page.getByLabel('Lote de origem')).toBeHidden();
    await expect(page.getByLabel('Nome do produto')).toBeHidden();
    await expect(
      page.getByRole('region', { name: 'Painel de validade' }),
    ).toBeVisible();
    await openArea(page, 'Receber');
    await expect(page.getByLabel('Lote de origem')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Painel de validade' }),
    ).toBeHidden();
    await openArea(page, 'Cadastros');
    await expect(
      page.getByRole('button', {
        name: 'Gerenciar unidades de Empresa de teste A',
      }),
    ).toBeVisible();
    await expect(page.getByLabel('Nome da organização')).toBeVisible();
    await expect(areaLink(page, 'Cadastros')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await areaLink(page, 'Fornecedores').click();
    await expect(page).toHaveURL(/#cadastro-fornecedores$/);
    await expect(page.locator('#cadastro-fornecedores')).toBeFocused();
    await expect(areaLink(page, 'Produtos')).toBeVisible();
    // Desktop: menu à esquerda do conteúdo.
    const menu = await nav(page).boundingBox();
    const content = await page
      .getByRole('region', { name: /^Cozinha principal: / })
      .boundingBox();
    expect(menu.x + menu.width).toBeLessThanOrEqual(content.x);
  });
});

test('colaborador: só as áreas do perfil; Receber pedido pelo endereço cai em Validade', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users, scopeA }) => {
    await page.goto('/');
    await signIn(page, users[2]);
    await openUnit(page);
    await expect(nav(page).getByRole('link')).toHaveText([
      'Validade',
      'Produção',
      'Locais',
      'Configurações',
    ]);
    await expect(areaLink(page, 'Receber')).toHaveCount(0);
    await expect(areaLink(page, 'Cadastros')).toHaveCount(0);
    await openArea(page, 'Configurações');
    await expect(
      page.getByText(
        'Somente o proprietário muda as configurações da unidade.',
      ),
    ).toBeVisible();
    // O catálogo e a gestão de unidades não existem para o colaborador.
    await expect(page.getByLabel('Nome do produto')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Gerenciar unidades/ }),
    ).toHaveCount(0);
    // Endereço de área que o perfil não vê: cai na tela inicial da unidade.
    await page.goto(`/?unidade=${scopeA.establishment_id}&area=receber`);
    await expect(areaLink(page, 'Validade')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByLabel('Lote de origem')).toHaveCount(0);
  });
});

test('o que foi digitado não se perde ao trocar de área; endereço e voltar funcionam', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users, scopeA }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await openUnit(page);
    await openArea(page, 'Receber');
    await page.getByLabel('Lote de origem').fill('L-123');
    await page.getByLabel('Quantidade recebida').fill('7.5');
    await openArea(page, 'Cadastros');
    await page.getByLabel('Nome do produto').fill('Farinha de teste');
    await openArea(page, 'Locais');
    await openArea(page, 'Receber');
    await expect(page.getByLabel('Lote de origem')).toHaveValue('L-123');
    await expect(page.getByLabel('Quantidade recebida')).toHaveValue('7.5');
    await openArea(page, 'Cadastros');
    await expect(page.getByLabel('Nome do produto')).toHaveValue(
      'Farinha de teste',
    );

    // O endereço reflete unidade e área; voltar segue o histórico das áreas.
    expect(page.url()).toContain(`unidade=${scopeA.establishment_id}`);
    expect(page.url()).toContain('area=cadastros');
    await page.goBack();
    await expect(areaLink(page, 'Receber')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByLabel('Lote de origem')).toHaveValue('L-123');

    // Link direto: abre a unidade na área pedida, depois de recarregar (sessão persistente da V2).
    await page.goto(`/?unidade=${scopeA.establishment_id}&area=locais`);
    await expect(areaLink(page, 'Locais')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(
      page.getByRole('region', { name: 'Locais de armazenamento' }),
    ).toBeVisible();
    // Unidade que a pessoa não tem: não abre nada.
    await page.goto('/?unidade=00000000-0000-4000-8000-000000000001');
    await expect(
      page.getByRole('button', { name: 'Abrir Cozinha principal' }),
    ).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
  });
});

test('celular: barra de navegação inferior, sem rolagem lateral, com Sair e unidade à vista', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 390, height: 844 });
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await openUnit(page);
    const box = await nav(page).boundingBox();
    expect(Math.round(box.y + box.height)).toBe(844);
    expect(box.width).toBeGreaterThanOrEqual(388);
    for (const link of await nav(page).getByRole('link').all()) {
      const rect = await link.boundingBox();
      expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.width).toBeGreaterThanOrEqual(44);
    }
    // Rolando a página, a faixa com unidade, usuário e Sair continua no alto.
    await openArea(page, 'Cadastros');
    await page.evaluate(() => globalThis.scrollTo(0, 400));
    const bar = page.getByRole('region', { name: 'Sessão' });
    await expect(bar.getByRole('button', { name: 'Sair' })).toBeInViewport();
    await expect(bar).toContainText('Cozinha principal');
    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth -
        globalThis.document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    // Conteúdo final não fica atrás da barra inferior.
    await page.evaluate(() =>
      globalThis.scrollTo(0, globalThis.document.body.scrollHeight),
    );
    const last = await page
      .locator('.unit-content')
      .evaluate((el) => el.getBoundingClientRect().bottom);
    expect(last).toBeLessThanOrEqual(844 - box.height + 1);
  });
});

test('QR e links diretos seguem funcionando com a sessão persistente', async ({
  browser,
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await openUnit(page);
    await openArea(page, 'Cadastros');
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
    await openArea(page, 'Receber');
    await page
      .getByRole('combobox', { name: 'Produto', exact: true })
      .selectOption({ label: 'Arroz de teste (kg)' });
    await page
      .getByRole('combobox', { name: 'Fornecedor', exact: true })
      .selectOption({ label: 'Horta de teste' });
    await page.getByLabel('Lote de origem').fill('QR-1');
    await page.getByLabel('Quantidade recebida').fill('2');
    await page.getByLabel('Data de validade').fill('2030-01-01');
    await page.getByRole('button', { name: 'Registrar recebimento' }).click();
    await expect(page.getByText('Recebimento registrado.')).toBeVisible();
    await openArea(page, 'Validade');
    await page.getByRole('button', { name: 'Ver ficha' }).click();
    const label = page.getByRole('region', { name: 'Recipiente', exact: true });
    const id = (await label.getByText(/Identificação:/).innerText()).replace(
      'Identificação: ',
      '',
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    // Sem sessão: o endereço do QR mostra a entrada e nenhum dado.
    const anonymous = await browser.newContext();
    const visitor = await anonymous.newPage();
    await visitor.goto(`/recipiente/${id}`);
    await expect(
      visitor.getByRole('button', { name: 'Entrar', exact: true }),
    ).toBeVisible();
    await expect(visitor.getByText(/Arroz de teste/)).toHaveCount(0);
    await anonymous.close();

    // Com sessão no mesmo navegador: abrir o QR (nova carga) não pede login.
    await page.goto(`/recipiente/${id}`);
    const again = page.getByRole('region', { name: 'Recipiente', exact: true });
    await expect(again.getByText(`Identificação: ${id}`)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Sair', exact: true }),
    ).toBeVisible();
  });
});
