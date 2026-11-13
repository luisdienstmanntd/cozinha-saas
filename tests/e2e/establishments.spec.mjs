import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';

async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Catálogo de Cozinha principal' }),
  ).toBeVisible();
}

test('proprietário cria e renomeia unidade; colaborador não vê a gestão', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users, admin, scopeA, scopeA2 }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    const openTools = () =>
      page
        .getByRole('button', {
          name: 'Gerenciar unidades de Empresa de teste A',
        })
        .click();
    await openTools();
    const tools = page.getByRole('region', {
      name: 'Unidades de Empresa de teste A',
    });
    await expect(
      tools.getByText(/Vínculos ativos: 1 proprietário e 1 colaborador\./),
    ).toBeVisible();
    await expect(tools.getByText(/[0-9a-f]{8}-[0-9a-f]{4}-/)).toHaveCount(0);

    // Validação local não apaga a tela (bug corrigido neste incremento).
    await page.getByLabel('Nome da organização').fill('   ');
    await page.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Informe nome entre 1 e 120 caracteres.',
    );
    await expect(
      page.getByRole('button', { name: 'Catálogo de Cozinha principal' }),
    ).toBeVisible();

    await tools.getByLabel('Nome da nova unidade').fill('Cozinha de eventos');
    await tools
      .getByLabel('Fuso horário da nova unidade')
      .selectOption('America/Manaus');
    await tools.getByRole('button', { name: 'Revisar nova unidade' }).click();
    const review = tools.getByRole('group', { name: 'Confirmar nova unidade' });
    await expect(review).toBeFocused();
    await expect(review).toContainText('America/Manaus');
    await review.getByRole('button', { name: 'Confirmar criação' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Unidade Cozinha de eventos criada.',
    );
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: 'Cozinha de eventos — America/Manaus' }),
    ).toBeVisible();
    const created = checked(
      await admin
        .from('establishments')
        .select('id,timezone')
        .eq('organization_id', scopeA.organization_id)
        .eq('name', 'Cozinha de eventos'),
    );
    expect(created).toHaveLength(1);
    expect(created[0].timezone).toBe('America/Manaus');
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha de eventos' })
      .click();
    await expect(page.getByText('Nenhum produto cadastrado.')).toBeVisible();

    await openTools();
    const renamed = page.getByRole('region', {
      name: 'Unidades de Empresa de teste A',
    });
    await renamed
      .getByLabel('Novo nome para Cozinha auxiliar')
      .fill('Cozinha fria');
    await renamed
      .getByRole('button', { name: 'Renomear Cozinha auxiliar' })
      .click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Nome da unidade atualizado.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Catálogo de Cozinha fria' }),
    ).toBeVisible();
    const unit = checked(
      await admin
        .from('establishments')
        .select('name,timezone')
        .eq('id', scopeA2.establishment_id),
    );
    expect(unit).toEqual([
      { name: 'Cozinha fria', timezone: 'America/Sao_Paulo' },
    ]);

    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await signIn(page, users[2]);
    await expect(page.getByText('Papel: Colaborador')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Unidades de Empresa de teste A' }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Renomear/ })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Gerenciar unidades/ }),
    ).toHaveCount(0);
  });
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
]) {
  test(`área logada sem rolagem horizontal em ${viewport.width}px`, async ({
    page,
  }) => {
    page.setDefaultTimeout(5000);
    await page.setViewportSize(viewport);
    await withCatalogFixture(async ({ users }) => {
      await page.goto('/');
      await signIn(page, users[0]);
      await page
        .getByRole('button', { name: 'Catálogo de Cozinha principal' })
        .click();
      await expect(page.getByText('Nenhum produto cadastrado.')).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth -
          globalThis.document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const small = await page.evaluate(() =>
        [...globalThis.document.querySelectorAll('main button')]
          .filter((el) => el.getBoundingClientRect().height < 44)
          .map((el) => el.textContent),
      );
      expect(small).toEqual([]);
    });
  });
}
