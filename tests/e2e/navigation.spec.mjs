import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { areaLink, openArea, newCatalogItem, openAccount } from './areas.mjs';

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

async function prepareReceipt(page) {
  await newCatalogItem(page, 'Produtos');
  await page.getByLabel('Nome do produto').fill('Arroz operacional');
  await page.getByLabel('Unidade de medida').selectOption('kg');
  await page
    .getByRole('combobox', { name: 'Conservação', exact: true })
    .selectOption('ambient');
  await page
    .getByRole('button', { name: 'Cadastrar produto', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await newCatalogItem(page, 'Fornecedores');
  await page.getByLabel('Nome do fornecedor').fill('Fornecedor operacional');
  await page
    .getByRole('button', { name: 'Cadastrar fornecedor', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('proprietário: Mesa operacional, páginas próprias e links de Cadastros antigos', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await withCatalogFixture(async ({ users, scopeA }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await openUnit(page);
    await expect(areaLink(page, 'Visão geral')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(
      page.getByRole('heading', { name: 'Visão geral' }),
    ).toBeVisible();
    const bar = page.getByRole('region', { name: 'Sessão' });
    await expect(
      bar.getByRole('combobox', { name: 'Unidade', exact: true }),
    ).toHaveValue(scopeA.establishment_id);
    await bar.getByText('Minha conta', { exact: true }).click();
    await expect(bar.getByText(users[0].email, { exact: true })).toBeVisible();
    await bar.getByText('Minha conta', { exact: true }).click();
    await expect(bar.getByRole('button', { name: 'Sair' })).toBeVisible();
    await openArea(page, 'Validade');
    await expect(
      page.getByRole('region', { name: 'Painel de validade' }),
    ).toBeVisible();
    await expect(page.getByLabel('Lote de origem')).toBeHidden();
    await openArea(page, 'Receber');
    await expect(
      page.getByRole('region', { name: 'Antes de receber' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Painel de validade' }),
    ).toBeHidden();
    await openArea(page, 'Organização');
    await expect(
      page.getByRole('button', {
        name: 'Gerenciar unidades de Empresa de teste A',
      }),
    ).toBeVisible();
    await expect(page.getByLabel('Nome da organização')).toBeVisible();
    await openArea(page, 'Fornecedores');
    await expect(page).toHaveURL(/area=fornecedores$/);
    await expect(
      page.getByRole('heading', { name: 'Fornecedores' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Produtos', exact: true }),
    ).toHaveCount(0);
    await page.goto(
      `/?unidade=${scopeA.establishment_id}&area=cadastros#cadastro-fornecedores`,
    );
    await expect(areaLink(page, 'Fornecedores')).toHaveAttribute(
      'aria-current',
      'page',
    );
    const menu = await nav(page).boundingBox();
    const content = await page
      .getByRole('region', { name: /^Cozinha principal: / })
      .boundingBox();
    expect(menu.x + menu.width).toBeLessThanOrEqual(content.x);
  });
});

test('colaborador: só as áreas do perfil; Receber pedido pelo endereço cai na Visão geral', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users, scopeA }) => {
    await page.goto('/');
    await signIn(page, users[2]);
    await openUnit(page);
    for (const name of [
      'Visão geral',
      'Validade',
      'Produção',
      'Etiquetas',
      'Locais',
    ])
      await expect(areaLink(page, name)).toBeVisible();
    await expect(areaLink(page, 'Receber')).toHaveCount(0);
    await expect(areaLink(page, 'Cadastros')).toHaveCount(0);
    await openArea(page, 'Unidade');
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
    await expect(areaLink(page, 'Visão geral')).toHaveAttribute(
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
    await prepareReceipt(page);
    await openArea(page, 'Receber');
    await page.getByLabel('Lote de origem').fill('L-123');
    await page.getByLabel('Quantidade recebida').fill('7.5');
    await newCatalogItem(page, 'Produtos');
    await page
      .getByRole('dialog')
      .getByLabel('Nome do produto')
      .fill('Farinha de teste');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Fechar' })
      .click();
    await openArea(page, 'Locais');
    await openArea(page, 'Receber');
    await expect(page.getByLabel('Lote de origem')).toHaveValue('L-123');
    await expect(page.getByLabel('Quantidade recebida')).toHaveValue('7.5');
    await newCatalogItem(page, 'Produtos');
    await expect(
      page.getByRole('dialog').getByLabel('Nome do produto'),
    ).toHaveValue('Farinha de teste');
    await page.keyboard.press('Escape');

    // O endereço reflete unidade e área; voltar segue o histórico das áreas.
    expect(page.url()).toContain(`unidade=${scopeA.establishment_id}`);
    expect(page.url()).toContain('area=produtos');
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
      page.getByRole('region', {
        name: 'Locais de armazenamento',
        exact: true,
      }),
    ).toBeVisible();
    // Unidade que a pessoa não tem: não abre nada.
    await page.goto('/?unidade=00000000-0000-4000-8000-000000000001');
    await expect(
      page.getByRole('button', { name: 'Abrir Cozinha principal' }),
    ).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
  });
});

for (const width of [390, 320]) {
  test(`celular ${width}px: alertas antes dos indicadores e navegação acessível`, async ({
    page,
  }) => {
    page.setDefaultTimeout(5000);
    await page.setViewportSize({ width, height: 844 });
    await withCatalogFixture(async ({ users }) => {
      await page.goto('/');
      await signIn(page, users[0]);
      await openUnit(page);
      const alerts = page.getByRole('region', { name: 'Atenção às validades' });
      const totals = page.getByRole('region', {
        name: 'Recipientes com saldo por validade',
      });
      await expect(alerts).toBeVisible();
      expect((await alerts.boundingBox()).y).toBeLessThan(
        (await totals.boundingBox()).y,
      );
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      await menu.click();
      await expect(
        page.getByRole('button', { name: 'Cadastros', exact: true }),
      ).toHaveAttribute('aria-expanded', 'false');
      await expect(areaLink(page, 'Produtos')).toBeHidden();
      for (const link of await nav(page)
        .getByRole('link')
        .filter({ visible: true })
        .all()) {
        const rect = await link.boundingBox();
        expect(rect.height).toBeGreaterThanOrEqual(44);
        expect(rect.width).toBeGreaterThanOrEqual(44);
      }
      await openArea(page, 'Produtos');
      await expect(nav(page)).toBeHidden();
      await expect(
        page.getByRole('heading', { name: 'Produtos' }),
      ).toBeVisible();
      await prepareReceipt(page);
      await openArea(page, 'Receber');
      const product = page.getByRole('combobox', {
        name: 'Produto',
        exact: true,
      });
      const supplier = page.getByRole('combobox', {
        name: 'Fornecedor',
        exact: true,
      });
      const expiry = page.getByLabel('Data de validade');
      await expect(product).toBeVisible();
      expect((await product.boundingBox()).y).toBeLessThan(
        (await supplier.boundingBox()).y,
      );
      expect((await supplier.boundingBox()).y).toBeLessThan(
        (await expiry.boundingBox()).y,
      );
      await page.getByLabel('Lote de origem').fill('MOBILE-RASCUNHO');
      await openArea(page, 'Fornecedores');
      await openArea(page, 'Receber');
      await expect(page.getByLabel('Lote de origem')).toHaveValue(
        'MOBILE-RASCUNHO',
      );
      await openArea(page, 'Produção');
      await expect(
        page.getByRole('region', { name: 'Antes de produzir' }),
      ).toBeVisible();

      await page
        .getByRole('link', {
          name: 'Cadastrar preparação própria',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', { name: 'Nova preparação', exact: true })
        .click();
      const drawer = page.getByRole('dialog');
      await drawer.getByLabel('Nome da preparação').fill('Molho operacional');
      await drawer.getByLabel('Unidade de medida').selectOption('kg');
      await drawer
        .getByRole('combobox', { name: 'Conservação', exact: true })
        .selectOption('refrigerated');
      await drawer
        .getByRole('button', { name: 'Cadastrar preparação', exact: true })
        .click();
      await expect(drawer).toBeHidden();
      await openArea(page, 'Produção');
      await page
        .getByRole('button', { name: 'Registrar produção', exact: true })
        .click();
      const form = page.getByRole('form', { name: 'Registrar produção' });
      await form
        .getByRole('combobox', { name: 'Preparação', exact: true })
        .selectOption({ label: 'Molho operacional (kg)' });
      const quantity = form.getByLabel('Quantidade produzida (kg)');
      await quantity.fill('2,5');
      expect((await quantity.boundingBox()).width).toBeLessThanOrEqual(width);
      await openArea(page, 'Validade');
      await openArea(page, 'Produção');
      await expect(quantity).toHaveValue('2,5');
      const bar = page.getByRole('region', { name: 'Sessão' });
      await expect(bar.getByRole('button', { name: 'Sair' })).toBeInViewport();
      expect(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth,
        ),
      ).toBeLessThanOrEqual(width);
    });
  });
}

test('QR e links diretos seguem funcionando com a sessão persistente', async ({
  browser,
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await openUnit(page);
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
    await expect(label).toHaveAttribute('data-container-id', /^[0-9a-f-]{36}$/);
    const id = await label.getAttribute('data-container-id');
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
    await expect(again).toHaveAttribute('data-container-id', id);
    await expect(again.locator('.card-code')).toHaveText(/^C-\d{6,}$/);
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Sair', exact: true }),
    ).toBeVisible();
  });
});

test('mantém revisão de configurações ao cancelar e descarta após confirmar atualização', async ({
  page,
}) => {
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await openUnit(page);
    await openArea(page, 'Unidade');
    const settings = page.getByRole('region', {
      name: 'Configurações da unidade',
    });
    await settings
      .getByRole('button', { name: 'Alterar configurações' })
      .click();
    await settings
      .getByLabel('Janela de registro da produção (minutos)')
      .fill('90');
    await settings
      .getByRole('button', { name: 'Revisar configurações' })
      .click();
    const review = settings.getByRole('region', {
      name: 'Revisão das configurações',
    });
    await expect(review).toContainText('2 horas → 1 hora e 30 minutos');

    await openAccount(page);
    // O aviso só aparece depois que o acesso novo chega: responde o diálogo assim
    // que ele abre (sem travar o clique) e só então confere a mensagem.
    const warning = new Promise((resolve) => {
      page.once('dialog', async (dialog) => {
        const message = dialog.message();
        await dialog.dismiss();
        resolve(message);
      });
    });
    await page.getByRole('button', { name: 'Atualizar acesso' }).click();
    expect(await warning).toContain('não salvas');
    await expect(review).toContainText('2 horas → 1 hora e 30 minutos');

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Atualizar acesso' }).click();
    await expect(
      settings.getByRole('button', { name: 'Alterar configurações' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Revisão das configurações' }),
    ).toHaveCount(0);
  });
});
