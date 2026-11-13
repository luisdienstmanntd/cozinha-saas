import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// Fatia 6.6, E2E 27, 28, 30, 31 e 33 do desenho (seção 8): abrir embalagem com sobra fechada,
// porcionar o derivado com sobra descartada, QR da origem com aviso e derivados, anulação pela tela
// e escrita só do proprietário. Nenhum texto afirma conformidade sanitária.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Catálogo de Cozinha principal' }),
  ).toBeVisible();
}

function ymd(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return date.toISOString().slice(0, 10);
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

test('abrir, porcionar, consultar o QR da origem e anular; membro só lê', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await receive(page, '10');
    const rows = page.getByRole('list', { name: 'Recipientes e validade' });
    const origin = rows
      .getByRole('listitem')
      .filter({ hasText: 'lote 0001' })
      .filter({ hasNotText: '(derivado)' });

    // E2E 27: abrir embalagem, 4 kg, o restante continua fechado.
    await origin.getByRole('button', { name: 'Abrir / porcionar' }).click();
    const form = page.getByRole('region', {
      name: 'Abrir ou porcionar',
      exact: true,
    });
    await expect(form).toContainText('saldo 10 kg');
    await expect(form).toContainText('O sistema não calcula prazos.');
    await form.getByLabel('Quantidade aberta (kg)').fill('4');
    await form.getByLabel('Sim, continua fechado').check();
    await form.getByLabel('Validade após a abertura').fill(ymd(5));
    // Sem nome de exibição, a pessoa é definida na própria tela.
    await form
      .getByLabel('Pessoa sem nome de exibição')
      .selectOption({ label: 'Você (sem nome)' });
    await form.getByLabel('Nome curto (até 40 caracteres)').fill('Ana');
    await form.getByRole('button', { name: 'Definir nome' }).click();
    await expect(form.getByLabel('Manipulado por')).toContainText('Ana');
    await form.getByRole('button', { name: 'Revisar registro' }).click();
    const review = page.getByRole('region', {
      name: 'Revisão da manipulação',
    });
    await expect(review).toContainText('Manipulado por: Ana');
    await expect(review).toContainText(
      'continua fechada na embalagem original',
    );
    await review.getByRole('button', { name: 'Confirmar registro' }).click();
    const result = page.getByRole('region', {
      name: 'Resultado da manipulação',
    });
    await expect(result).toContainText(
      'Sobra de 6 kg segue fechada na embalagem original',
    );
    await expect(
      result.getByRole('list', { name: 'Recipientes criados' }),
    ).toContainText('4 kg');
    await expect(result).not.toContainText(/aprovad|conform/i);
    await result.getByRole('button', { name: 'Fechar' }).click();
    await expect(origin).toContainText('saldo 6 kg');
    const derived = rows
      .getByRole('listitem')
      .filter({ hasText: '(derivado)' });
    await expect(derived).toContainText('saldo 4 kg');
    await expect(derived).toContainText('após manipulação');

    // E2E 28: porcionar o derivado em 3 de 1 kg; a sobra de 1 kg só pode ser porção ou descarte.
    await derived.getByRole('button', { name: 'Abrir / porcionar' }).click();
    await form.getByLabel('Dividir em porções').check();
    await form.getByLabel(/Número de porções/).fill('3');
    for (const index of [1, 2, 3])
      await form.getByLabel(`Porção ${index} (kg)`).fill('1');
    await expect(form).toContainText('sobra: 1 kg');
    await expect(form.getByLabel('Sim, continua fechado')).toHaveCount(0);
    await expect(form.getByLabel('Incluir como porção')).toBeVisible();
    await form.getByLabel('Validade após a abertura').fill(ymd(3));
    await form.getByRole('button', { name: 'Revisar registro' }).click();
    await expect(form.getByRole('alert')).toContainText(
      'Informe o que acontece com a sobra.',
    );
    await form.getByLabel('Descartar').check();
    await form.getByLabel('Motivo do descarte da sobra').fill('Sobra sem uso');
    await form.getByRole('button', { name: 'Revisar registro' }).click();
    await review.getByRole('button', { name: 'Confirmar registro' }).click();
    await expect(result).toContainText('Sobra de 1 kg descartada.');
    await result.getByRole('button', { name: 'Fechar' }).click();

    // E2E 31: QR da origem avisa que foi aberta e leva aos derivados.
    await origin.getByRole('button', { name: 'Abrir etiqueta' }).click();
    const label = page.getByRole('region', { name: 'Recipiente', exact: true });
    await expect(label).toContainText('Este recipiente foi aberto em');
    await expect(label).toContainText('Use a etiqueta nova');
    const family = label.getByRole('region', { name: 'Origem e derivados' });
    await expect(family).toContainText('por Ana');
    await family
      .getByRole('button', { name: /^Abrir C-/ })
      .first()
      .click();
    await expect(label).toContainText('Recipiente derivado');
    await expect(label).toContainText('(após manipulação)');
    await expect(label).toContainText(
      'A etiqueta de produto aberto ou fracionado chega na próxima fatia',
    );
    await expect(
      label.getByRole('button', { name: 'Gerar etiqueta PDF' }),
    ).toHaveCount(0);
    await expect(label).toContainText('Origem:');
    // Do derivado à primeira porção.
    await label
      .getByRole('list', { name: 'Manipulações deste recipiente' })
      .getByRole('button', { name: /^Abrir C-/ })
      .first()
      .click();
    await expect(label).toContainText('porção 1 de 3');
    await expect(label).toContainText('Manipulado por Ana');

    // E2E 33: membro vê a mesma origem, sem ações de escrita.
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await signIn(page, users[2]);
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    await expect(
      page.getByRole('button', { name: 'Abrir / porcionar' }),
    ).toHaveCount(0);

    // Proprietário anula a porcionamento pela tela da porção (nada foi consumido).
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await signIn(page, users[0]);
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    await origin.getByRole('button', { name: 'Abrir etiqueta' }).click();
    await family
      .getByRole('button', { name: /^Abrir C-/ })
      .first()
      .click();
    await label
      .getByRole('list', { name: 'Manipulações deste recipiente' })
      .getByRole('button', { name: /^Abrir C-/ })
      .first()
      .click();
    await label.getByRole('button', { name: 'Anular manipulação' }).click();
    await label
      .getByLabel('Motivo da anulação')
      .fill('Porcionamento lançado por engano');
    await label.getByRole('button', { name: 'Confirmar anulação' }).click();
    await expect(label).toContainText('Manipulação anulada em');
    await expect(label).toContainText('Porcionamento lançado por engano');
    await expect(
      label.getByRole('button', { name: 'Gerar etiqueta PDF' }),
    ).toHaveCount(0);
  });
});

test('registro fora da janela avisa e exige justificativa; o banco recusa horário anterior ao recipiente', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await receive(page, '5');
    const rows = page.getByRole('list', { name: 'Recipientes e validade' });
    await rows.getByRole('button', { name: 'Abrir / porcionar' }).click();
    const form = page.getByRole('region', {
      name: 'Abrir ou porcionar',
      exact: true,
    });
    await form.getByLabel('Quantidade aberta (kg)').fill('5');
    const field = form.getByLabel(/^Aberto em/);
    const current = await field.inputValue();
    const earlier = new Date(`${current}:00Z`);
    earlier.setUTCHours(earlier.getUTCHours() - 3);
    await field.fill(earlier.toISOString().slice(0, 16));
    await expect(form.getByRole('note').first()).toHaveText(
      'Registro fora da janela. Ficará bloqueado até a decisão do responsável.',
    );
    await form.getByLabel('Validade após a abertura').fill(ymd(2));
    await form
      .getByLabel('Pessoa sem nome de exibição')
      .selectOption({ label: 'Você (sem nome)' });
    await form.getByLabel('Nome curto (até 40 caracteres)').fill('Ana');
    await form.getByRole('button', { name: 'Definir nome' }).click();
    await form.getByRole('button', { name: 'Revisar registro' }).click();
    await expect(form.getByRole('alert')).toContainText(
      'exige justificativa do atraso',
    );
    await form.getByLabel('Justificativa do atraso').fill('Sistema fora do ar');
    await form.getByRole('button', { name: 'Revisar registro' }).click();
    await page
      .getByRole('region', { name: 'Revisão da manipulação' })
      .getByRole('button', { name: 'Confirmar registro' })
      .click();
    await expect(form.getByRole('alert')).toContainText(
      'O horário da manipulação não pode ser anterior ao do recipiente de origem.',
    );
  });
});
