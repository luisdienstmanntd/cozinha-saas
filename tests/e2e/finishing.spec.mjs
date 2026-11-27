import { expect, test } from '@playwright/test';
import { openArea, newCatalogItem } from './areas.mjs';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// V4 (D-062): acabamento visual. Passo a passo da unidade vazia, rádio alinhado com rótulo de 44 px,
// três níveis de botão, "Mudar de local" que fecha, "Mais ações" no celular (teclado) e cabeçalho
// compacto. Dados sintéticos.
const RISK = 'rgb(185, 28, 28)';

async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Abrir Cozinha principal' }),
  ).toBeVisible();
}

test('proprietário e colaborador: acabamento no desktop e no celular', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    // D3: "Abrir" curto na tela, com o nome da unidade no nome acessível.
    const openUnit = page.getByRole('button', {
      name: 'Abrir Cozinha principal',
    });
    await expect(openUnit).toHaveText('Abrir');
    await openUnit.click();
    await openArea(page, 'Validade');

    // D1: unidade vazia mostra os primeiros passos, com link para a área certa.
    const steps = page.getByRole('region', { name: 'Primeiros passos' });
    await expect(steps).toBeVisible();
    await expect(steps).toContainText('falta produto e fornecedor');
    await steps
      .getByRole('link', { name: 'Cadastrar produtos e fornecedores' })
      .click();
    await expect(page).toHaveURL(/area=produtos/);
    await newCatalogItem(page, 'Produtos');
    await page.getByLabel('Nome do produto').fill('Frango de teste');
    await page.getByLabel('Unidade de medida').selectOption('kg');
    await page
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('refrigerated');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(
      page.getByText('Frango de teste — kg — Refrigerado'),
    ).toBeVisible();
    await newCatalogItem(page, 'Fornecedores');
    await page.getByLabel('Nome do fornecedor').fill('Granja de teste');
    await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
    // O formulário de Receber fica montado (oculto) e recebe o fornecedor novo.
    await expect(
      page
        .getByRole('combobox', {
          name: 'Fornecedor',
          exact: true,
          includeHidden: true,
        })
        .locator('option', { hasText: 'Granja de teste' }),
    ).toHaveCount(1);
    await openArea(page, 'Validade');
    await expect(steps).toContainText(
      'Cadastrar produtos e fornecedores — feito',
    );
    await steps
      .getByRole('link', { name: 'Registrar o primeiro recebimento' })
      .click();
    await expect(page).toHaveURL(/area=receber/);

    // M2: rádio alinhado ao texto, com o rótulo inteiro como alvo de 44 px.
    await page
      .getByRole('combobox', { name: 'Produto', exact: true })
      .selectOption({ label: 'Frango de teste (kg)' });
    await page
      .getByRole('combobox', { name: 'Fornecedor', exact: true })
      .selectOption({ label: 'Granja de teste' });
    for (const text of ['Temperatura medida', 'Não foi possível medir']) {
      const radio = page.getByRole('radio', { name: text });
      const label = page.locator('label').filter({ has: radio });
      const r = await radio.boundingBox();
      const l = await label.boundingBox();
      expect(l.height).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeLessThan(30);
      expect(
        Math.abs(r.y + r.height / 2 - (l.y + l.height / 2)),
      ).toBeLessThanOrEqual(3);
    }
    // Tocar no texto do rótulo marca o rádio.
    await page.getByText('Temperatura medida', { exact: true }).click();
    await expect(
      page.getByRole('radio', { name: 'Temperatura medida' }),
    ).toBeChecked();
    await page.getByLabel('Temperatura medida, em °C').fill('3');
    await page.getByLabel('Lote de origem').fill('F-V4');
    await page.getByLabel('Quantidade recebida').fill('4');
    await page.getByLabel('Data de validade').fill('2030-01-01');
    const register = page.getByRole('button', {
      name: 'Registrar recebimento',
    });
    // M1: ação principal em laranja escuro.
    await expect(register).toHaveCSS('background-color', 'rgb(194, 65, 12)');
    await register.click();
    await expect(page.getByText('Recebimento registrado.')).toBeVisible();

    // Local para o teste de "Mudar de local".
    await openArea(page, 'Locais');
    const panel = page.getByRole('region', { name: 'Locais de armazenamento' });
    await panel.getByRole('button', { name: 'Novo local' }).click();
    await panel.getByLabel('Nome do local').fill('Câmara fria 01');
    await panel.getByLabel('Condição do local').selectOption('refrigerated');
    await panel.getByRole('button', { name: 'Criar local' }).click();
    const off = panel.getByRole('button', { name: 'Desativar Câmara fria 01' });
    await expect(off).toHaveText('Desativar');
    await expect(off).toHaveCSS('color', RISK);

    // Desktop: ações do cartão à vista; anular registro é de risco.
    await openArea(page, 'Validade');
    const list = page.getByRole('list', { name: 'Recipientes e validade' });
    const card = list.getByRole('listitem').filter({ hasText: 'F-V4' });
    await expect(card.getByText('Mais ações')).toHaveCount(0);
    await card.getByRole('button', { name: 'Ver movimentações' }).click();
    const movements = page.getByRole('region', { name: 'Movimentações' });
    await movements.getByLabel('Quantidade da saída').fill('0.5');
    await movements.getByRole('button', { name: 'Registrar saída' }).click();
    await movements.getByRole('button', { name: 'Confirmar saída' }).click();
    const undo = movements.getByRole('button', { name: 'Anular registro' });
    await expect(undo).toHaveCSS('color', RISK);
    await expect(undo).toHaveCSS('border-top-color', RISK);

    // Celular: cabeçalho compacto, ações em ícones (alvo de 44 px) e "Mudar de local" pelo teclado, que fecha.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const title = page.getByRole('heading', {
      level: 1,
      name: 'CozziGo — unidades, recebimentos e validade',
    });
    await expect(title).toHaveCount(1);
    const bar = page.getByRole('region', { name: 'Sessão' });
    // Fatia 8.1b (D-065): depois do reload o título só encolhe quando a unidade volta a abrir
    // (`.workspace.unit-open`, styles.css). Esperar o nome da unidade na barra antes de medir; medir
    // antes disso lia o título inteiro (84 px) e falhou uma vez na CI. O limite de 1 px não mudou.
    await expect(bar).toContainText('Cozinha principal');
    await expect
      .poll(async () => (await title.boundingBox())?.height ?? Infinity)
      .toBeLessThanOrEqual(1);
    await expect(bar).toContainText(users[0].email);
    await expect(bar.getByRole('button', { name: 'Sair' })).toBeInViewport();
    const mobileCard = page
      .getByRole('list', { name: 'Recipientes e validade' })
      .getByRole('listitem')
      .filter({ hasText: 'F-V4' });
    await expect(mobileCard).toBeInViewport();
    await expect(
      mobileCard.getByRole('button', { name: 'Ver ficha' }),
    ).toBeVisible();
    await expect(
      mobileCard.getByRole('button', { name: 'Abrir / porcionar' }),
    ).toBeVisible();
    // PR-16: as ações secundárias são botões de ícone, todas à vista, com alvo de toque de 44 px e dica.
    const move = mobileCard.getByRole('button', { name: 'Mudar de local' });
    await expect(move).toBeVisible();
    await expect(mobileCard.getByText('Mais ações')).toHaveCount(0);
    for (const name of ['Ver ficha', 'Ver movimentações', 'Mudar de local']) {
      const icon = mobileCard.getByRole('button', { name });
      await expect(icon).toHaveAttribute('title', name);
      const box = await icon.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await move.focus();
    await page.keyboard.press('Enter');
    const form = page.getByRole('form', { name: 'Mudar de local' });
    await form
      .getByLabel('Seu nome de exibição (até 40 caracteres)')
      .fill('Pessoa de teste');
    await form.getByRole('button', { name: 'Definir nome' }).click();
    await form
      .getByLabel('Novo local')
      .selectOption({ label: 'Câmara fria 01 — Refrigerado' });
    await form.getByRole('button', { name: 'Registrar local' }).click();
    const moved = mobileCard
      .getByRole('status')
      .filter({ hasText: 'Local registrado' });
    await expect(moved).toBeFocused();
    await expect(form).toHaveCount(0);
    await expect(mobileCard).toContainText('Local Câmara fria 01');
    const overflow = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth -
        globalThis.document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await bar.getByRole('button', { name: 'Sair' }).click();

    // Colaborador no celular: só consulta, sem "Mais ações".
    await signIn(page, users[2]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Validade');
    const memberCard = page
      .getByRole('list', { name: 'Recipientes e validade' })
      .getByRole('listitem')
      .filter({ hasText: 'F-V4' });
    await expect(
      memberCard.getByRole('button', { name: 'Ver ficha' }),
    ).toBeVisible();
    await expect(
      memberCard.getByRole('button', { name: 'Ver movimentações' }),
    ).toBeVisible();
    await expect(memberCard.getByText('Mais ações')).toHaveCount(0);
    await expect(
      memberCard.getByRole('button', { name: 'Mudar de local' }),
    ).toHaveCount(0);
  });
});
