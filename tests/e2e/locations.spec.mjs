import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// Fatia 6.9, E2E 25 do desenho: criar locais, mudar o recipiente de local (com confirmação quando a
// condição do local difere) e conferir que saldo e validade não mudam. Só o proprietário escreve.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Catálogo de Cozinha principal' }),
  ).toBeVisible();
}

async function receive(page, quantity) {
  await page
    .getByRole('button', { name: 'Catálogo de Cozinha principal' })
    .click();
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
  await page
    .getByRole('combobox', { name: 'Produto', exact: true })
    .selectOption({ label: 'Arroz de teste (kg)' });
  await page
    .getByRole('combobox', { name: 'Fornecedor', exact: true })
    .selectOption({ label: 'Horta de teste' });
  await page.getByLabel('Lote de origem').fill('0001');
  await page.getByLabel('Quantidade recebida').fill(quantity);
  await page.getByLabel('Data de validade').fill('2030-01-01');
  await page.getByRole('button', { name: 'Registrar recebimento' }).click();
  await expect(page.getByText('Recebimento registrado.')).toBeVisible();
}

test('criar locais e mudar o recipiente de local, sem alterar saldo nem validade', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await receive(page, '10');

    const panel = page.getByRole('region', { name: 'Locais de armazenamento' });
    await panel.getByLabel('Nome do local').fill('Despensa');
    await panel.getByLabel('Condição do local').selectOption('ambient');
    await panel.getByRole('button', { name: 'Criar local' }).click();
    await expect(panel).toContainText('Despensa — Ambiente');
    await panel.getByLabel('Nome do local').fill('Câmara fria 01');
    await panel.getByLabel('Condição do local').selectOption('refrigerated');
    await panel.getByRole('button', { name: 'Criar local' }).click();
    await expect(panel).toContainText('Câmara fria 01 — Refrigerado');
    // Nome repetido é recusado pelo banco.
    await panel.getByLabel('Nome do local').fill('despensa');
    await panel.getByRole('button', { name: 'Criar local' }).click();
    await expect(panel.getByRole('alert')).toContainText(
      'Já existe um local com esse nome',
    );

    const rows = page.getByRole('list', { name: 'Recipientes e validade' });
    const row = rows.getByRole('listitem').filter({ hasText: 'lote 0001' });
    await expect(row).not.toContainText('local:');
    await row.getByRole('button', { name: 'Mudar de local' }).click();
    const form = page.getByRole('form', { name: 'Mudar de local' });
    await expect(form).toContainText('Sem local registrado.');
    await expect(form).toContainText(
      'Não altera saldo, validade nem conservação',
    );
    // Sem nome de exibição, a pessoa é definida na própria tela.
    await form
      .getByLabel('Seu nome de exibição (até 40 caracteres)')
      .fill('Ana');
    await form.getByRole('button', { name: 'Definir nome' }).click();
    await expect(form.getByLabel('Quem mudou o recipiente')).toContainText(
      'Ana',
    );
    await form
      .getByLabel('Novo local')
      .selectOption({ label: 'Despensa — Ambiente' });
    await form.getByRole('button', { name: 'Registrar local' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Local registrado' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(row).toContainText('local: Despensa');

    // Divergência: ambiente em câmara fria pede confirmação explícita.
    await row.getByRole('button', { name: 'Mudar de local' }).click();
    const again = page.getByRole('form', { name: 'Mudar de local' });
    await expect(again).toContainText('Local atual: Despensa.');
    await again
      .getByLabel('Novo local')
      .selectOption({ label: 'Câmara fria 01 — Refrigerado' });
    await again.getByRole('button', { name: 'Registrar local' }).click();
    await expect(again.getByRole('alert')).toContainText(
      'condição do local é diferente',
    );
    await expect(row).toContainText('local: Despensa');
    await again.getByRole('button', { name: 'Registrar mesmo assim' }).click();
    await page.getByRole('button', { name: 'Fechar' }).click();
    await expect(row).toContainText('local: Câmara fria 01');
    // Saldo e validade seguem os mesmos.
    await expect(row).toContainText('saldo 10 kg de 10 kg');
    await expect(row).toContainText('validade 2030-01-01');

    // Local desativado não aparece como destino.
    await panel.getByRole('button', { name: 'Desativar Despensa' }).click();
    await expect(panel).toContainText('(desativado)');
    await row.getByRole('button', { name: 'Mudar de local' }).click();
    const last = page.getByRole('form', { name: 'Mudar de local' });
    await expect(
      last.getByLabel('Novo local').locator('option', { hasText: 'Despensa' }),
    ).toHaveCount(0);
  });
});

test('membro vê os locais, mas não cria nem muda de local', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    const panel = page.getByRole('region', { name: 'Locais de armazenamento' });
    await panel.getByLabel('Nome do local').fill('Despensa');
    await panel.getByRole('button', { name: 'Criar local' }).click();
    await expect(panel).toContainText('Despensa — Refrigerado');
    await page.reload();
    await signIn(page, users[2]);
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    const view = page.getByRole('region', { name: 'Locais de armazenamento' });
    await expect(view).toContainText('Despensa — Refrigerado');
    await expect(view.getByLabel('Nome do local')).toHaveCount(0);
    await expect(view.getByRole('button')).toHaveCount(0);
  });
});
