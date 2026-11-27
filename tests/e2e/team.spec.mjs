import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';
import { areaLink, openArea } from './areas.mjs';

// D-077: Equipe da empresa (só proprietário). O proprietário vincula uma conta já criada, troca o papel,
// revoga (a pessoa perde o acesso na hora) e restaura. O colaborador não tem a área. Dados sintéticos.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
}

const person = (page, name) =>
  page
    .getByRole('region', { name: 'Pessoas com acesso' })
    .getByRole('listitem', { name, exact: true });

test('proprietário: lista, adiciona, troca papel, revoga e restaura', async ({
  page,
  browser,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await withCatalogFixture(async ({ admin, users }) => {
    // Conta nova, criada e confirmada pela administração (fora do site).
    const newcomer = {
      email: `equipe-${randomUUID()}@example.test`,
      password: randomUUID(),
    };
    const { user: created } = checked(
      await admin.auth.admin.createUser({ ...newcomer, email_confirm: true }),
    );
    users.push({ id: created.id, ...newcomer });
    // Nomes de exibição como no uso real (a gravação pelo service_role fica auditada sem autor).
    for (const [user, name] of [
      [users[0], 'Ana'],
      [users[2], 'Bruno'],
    ])
      checked(
        await admin
          .from('memberships')
          .update({ display_name: name })
          .eq('user_id', user.id),
      );

    // O colaborador está com o site aberto em outro navegador.
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    memberPage.setDefaultTimeout(5000);
    await memberPage.goto('/');
    await signIn(memberPage, users[2]);
    await expect(
      memberPage.getByRole('button', { name: 'Abrir Cozinha principal' }),
    ).toBeVisible();

    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Equipe');
    await expect(
      page.getByRole('heading', { name: 'Equipe', level: 2 }),
    ).toBeVisible();
    await expect(page.getByText('Com acesso (2)')).toBeVisible();
    const self = page
      .getByRole('region', { name: 'Pessoas com acesso' })
      .getByRole('listitem')
      .filter({ hasText: 'Você' });
    await expect(self).toContainText(users[0].email);
    await expect(self).toContainText('Proprietário');
    await expect(self.getByRole('button', { name: /Revogar/ })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('01-equipe-desktop.png'),
      fullPage: true,
    });

    // Conta inexistente: recusa genérica, sem revelar nada.
    await page.getByRole('button', { name: 'Adicionar pessoa' }).click();
    const form = page.getByRole('form', { name: 'Adicionar pessoa' });
    await form.getByLabel('E-mail da conta').fill('ninguem@example.test');
    await form.getByLabel(/Nome de exibição/).fill('Ninguém');
    await form.getByRole('button', { name: 'Adicionar à equipe' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Não foi possível vincular este e-mail.',
    );
    await page.screenshot({
      path: testInfo.outputPath('02-adicionar-recusa-desktop.png'),
      fullPage: true,
    });

    await form.getByLabel('E-mail da conta').fill(newcomer.email);
    await form.getByLabel(/Nome de exibição/).fill('Nina');
    await form.getByRole('button', { name: 'Adicionar à equipe' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Nina entrou na equipe com o papel Colaborador.',
    );
    await expect(person(page, 'Nina')).toContainText('Colaborador');
    await expect(page.getByText('Com acesso (3)')).toBeVisible();

    // Trocar papel, com confirmação.
    await page
      .getByRole('button', { name: 'Tornar Nina proprietário' })
      .click();
    await page
      .getByRole('button', { name: 'Confirmar: tornar proprietário' })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Papel de Nina alterado para Proprietário.',
    );
    await expect(person(page, 'Nina')).toContainText('Proprietário');

    // Revogar o colaborador que está com o site aberto.
    const memberRow = page
      .getByRole('region', { name: 'Pessoas com acesso' })
      .getByRole('listitem')
      .filter({ hasText: users[2].email });
    await memberRow.getByRole('button', { name: /^Revogar acesso de/ }).click();
    await expect(
      memberRow.getByRole('group', { name: /^Confirmar revogação/ }),
    ).toContainText('perde o acesso na hora');
    await page.screenshot({
      path: testInfo.outputPath('03-confirmar-revogacao-desktop.png'),
      fullPage: true,
    });
    await memberRow
      .getByRole('button', { name: 'Confirmar revogação' })
      .click();
    await expect(page.getByRole('status')).toContainText('foi revogado.');
    await expect(page.getByText('Com acesso (2)')).toBeVisible();
    await page.getByText('Acesso revogado (1)').click();
    await page.screenshot({
      path: testInfo.outputPath('04-acesso-revogado-desktop.png'),
      fullPage: true,
    });

    // A sessão aberta do colaborador deixa de ver a empresa.
    await memberPage.reload();
    await expect(
      memberPage.getByText(
        'Nenhum vínculo ativo. Solicite acesso ao responsável.',
      ),
    ).toBeVisible();
    await expect(
      memberPage.getByRole('button', { name: 'Abrir Cozinha principal' }),
    ).toHaveCount(0);
    await memberContext.close();

    // Restaurar: volta como colaborador.
    await page.getByRole('button', { name: /^Restaurar acesso de/ }).click();
    await expect(page.getByRole('status')).toContainText(
      'foi restaurado como colaborador.',
    );
    await expect(page.getByText('Com acesso (3)')).toBeVisible();

    // Celular: sem rolagem lateral.
    await page.setViewportSize({ width: 390, height: 844 });
    await openArea(page, 'Equipe');
    await expect(page.getByText('Com acesso (3)')).toBeVisible();
    const width = await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth,
    );
    expect(width).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: testInfo.outputPath('05-equipe-celular.png'),
      fullPage: true,
    });
  });
});

test('colaborador: sem a área Equipe, e o endereço direto abre a Visão geral', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await withCatalogFixture(async ({ users, scopeA }) => {
    await page.goto('/');
    await signIn(page, users[2]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await expect(areaLink(page, 'Visão geral')).toBeVisible();
    await expect(areaLink(page, 'Equipe')).toHaveCount(0);
    await page.goto(`/?unidade=${scopeA.establishment_id}&area=config-equipe`);
    await expect(
      page.getByRole('heading', { name: 'Visão geral', level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Equipe', level: 2 }),
    ).toHaveCount(0);
  });
});
