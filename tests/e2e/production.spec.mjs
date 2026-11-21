import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { openArea } from './areas.mjs';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// Fatia 7.3: cadastrar a preparação, registrar a produção em passos (validade por extenso), ver o lote
// na lista de recipientes como "preparação própria", anular a produção e ver "ANULADO" no recipiente.
// Dados sintéticos; a unidade de teste usa America/Sao_Paulo.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Abrir Cozinha principal' }),
  ).toBeVisible();
}

// Baixa o PDF pelo botão e devolve os bytes; o texto desenhado em ASCII pode ser procurado neles.
async function download(page, testInfo, button, name) {
  const waiting = page.waitForEvent('download');
  await button.click();
  const file = await waiting;
  const path = testInfo.outputPath(name);
  await file.saveAs(path);
  return { bytes: await readFile(path), name: file.suggestedFilename() };
}
const has = (bytes, text) => bytes.includes(Buffer.from(text, 'latin1'));

// Cadastra a preparação e registra uma produção de 6 l com validade daqui a 2 dias.
async function produce(page) {
  await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
  await openArea(page, 'Preparações próprias');
  const catalog = page.getByRole('region', {
    name: 'Preparações próprias',
    exact: true,
  });
  await catalog.getByRole('button', { name: 'Nova preparação' }).click();
  await catalog.getByLabel('Nome da preparação').fill('Caldo de teste');
  await catalog.getByLabel('Unidade de medida').selectOption('l');
  await catalog
    .getByRole('combobox', { name: 'Conservação', exact: true })
    .selectOption('refrigerated');
  await catalog.getByRole('button', { name: 'Cadastrar preparação' }).click();
  await expect(catalog).toContainText('Caldo de teste — l — Refrigerado');
  await openArea(page, 'Produção');
  const panel = page.getByRole('region', { name: 'Produção da cozinha' });
  await panel.getByRole('button', { name: 'Registrar produção' }).click();
  const form = panel.getByRole('form', { name: 'Registrar produção' });
  await form
    .getByLabel('Preparação')
    .selectOption({ label: 'Caldo de teste (l)' });
  await form.getByLabel('Quantidade produzida (l)').fill('6');
  await form.getByLabel('Validade', { exact: true }).fill(localDate(2));
  await form
    .getByLabel('Pessoa sem nome de exibição')
    .selectOption({ label: 'Você (sem nome)' });
  await form.getByLabel('Nome (até 40 caracteres)').fill('Ana Teste');
  await form.getByRole('button', { name: 'Definir nome' }).click();
  await form.getByLabel('Produzida por').selectOption({ label: 'Ana Teste' });
  await form.getByRole('button', { name: 'Revisar produção' }).click();
  await panel.getByRole('button', { name: 'Confirmar produção' }).click();
  return panel;
}

function localDate(offsetDays) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const value = new Date(`${today}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

test('registrar e anular produção da cozinha pela tela', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Preparações próprias');

    const catalog = page.getByRole('region', {
      name: 'Preparações próprias',
      exact: true,
    });
    await catalog.getByRole('button', { name: 'Nova preparação' }).click();
    await catalog.getByLabel('Nome da preparação').fill('Caldo de teste');
    await catalog.getByLabel('Unidade de medida').selectOption('l');
    await catalog
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('refrigerated');
    await catalog.getByRole('button', { name: 'Cadastrar preparação' }).click();
    await expect(catalog).toContainText('Caldo de teste — l — Refrigerado');
    // A preparação não entra no recebimento.
    await openArea(page, 'Receber');
    await expect(
      page
        .getByRole('combobox', { name: 'Produto', exact: true })
        .locator('option', { hasText: 'Caldo de teste' }),
    ).toHaveCount(0);

    await openArea(page, 'Produção');
    const panel = page.getByRole('region', { name: 'Produção da cozinha' });
    await expect(panel).toContainText('Nenhuma produção registrada.');
    await panel.getByRole('button', { name: 'Registrar produção' }).click();
    const form = panel.getByRole('form', { name: 'Registrar produção' });
    await form
      .getByLabel('Preparação')
      .selectOption({ label: 'Caldo de teste (l)' });
    await form.getByLabel('Quantidade produzida (l)').fill('6');
    const expiry = localDate(2);
    await form.getByLabel('Validade', { exact: true }).fill(expiry);
    // Sem nome de exibição, a pessoa é definida na própria tela.
    await form
      .getByLabel('Pessoa sem nome de exibição')
      .selectOption({ label: 'Você (sem nome)' });
    await form.getByLabel('Nome (até 40 caracteres)').fill('Ana Teste');
    await form.getByRole('button', { name: 'Definir nome' }).click();
    await expect(form.getByLabel('Produzida por')).toContainText('Ana Teste');
    await form.getByLabel('Produzida por').selectOption({ label: 'Ana Teste' });
    await form.getByRole('button', { name: 'Revisar produção' }).click();

    const review = panel.getByRole('region', { name: 'Revisão da produção' });
    const [y, m, d] = expiry.split('-');
    await expect(review).toContainText(
      new RegExp(`Validade ${d}/${m}/${y} \\(.+\\), 2 dias depois da produção`),
    );
    await expect(review).toContainText('Produzida por: Ana Teste');
    await review.getByRole('button', { name: 'Confirmar produção' }).click();
    await expect(
      panel.getByRole('region', { name: 'Resultado da produção' }),
    ).toContainText(/Produção registrada no recipiente C-\d{6}/);

    // Fatia 7.4: etiqueta "Preparação própria" do recipiente integral.
    const pdf = await download(
      page,
      testInfo,
      panel
        .getByRole('region', { name: 'Resultado da produção' })
        .getByRole('button', { name: 'Baixar etiqueta' }),
      'preparacao.pdf',
    );
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    for (const text of [
      'PREPARAÇÃO PRÓPRIA',
      'Caldo de teste',
      'VALIDADE',
      `${d}/${m}/${y}`,
      'Validade informada pelo responsável',
      'Produzido por: Ana Teste',
      'Conservação: Refrigerado',
      'Quantidade produzida: 6 l',
    ])
      expect(has(pdf.bytes, text), text).toBe(true);
    expect(has(pdf.bytes, 'RECEBIMENTO')).toBe(false);

    const productions = panel.getByRole('list', { name: 'Produções recentes' });
    await expect(productions).toContainText('Caldo de teste');
    await expect(productions).toContainText('por Ana Teste');
    await openArea(page, 'Validade');
    const rows = page.getByRole('list', { name: 'Recipientes e validade' });
    const row = rows
      .getByRole('listitem')
      .filter({ hasText: 'Caldo de teste' });
    await expect(row).toContainText('preparação própria');
    await expect(row).toContainText('Saldo 6 l de 6 l');

    // Anular: motivo obrigatório; depois o saldo é zero e a lista mostra ANULADA.
    await openArea(page, 'Produção');
    await productions.getByRole('button', { name: 'Anular produção' }).click();
    const voidForm = panel.getByRole('form', { name: /Anular produção C-/ });
    await voidForm
      .getByLabel('Motivo da anulação')
      .fill('Validade digitada errada');
    await voidForm.getByRole('button', { name: 'Confirmar anulação' }).click();
    await expect(productions).toContainText(
      /ANULADA em .*Validade digitada errada/,
    );
    await expect(
      productions.getByRole('button', { name: 'Anular produção' }),
    ).toHaveCount(0);
    await openArea(page, 'Validade');
    await expect(row).toHaveCount(0);
    await page.getByLabel('Mostrar esgotados').check();
    await expect(row).toContainText('Saldo 0 l de 6 l');
    await row.getByRole('button', { name: 'Ver ficha' }).click();
    const container = page.getByRole('region', { name: 'Recipiente' });
    await expect(container).toContainText('Preparação própria');
    await expect(container).toContainText('ANULADO');
    await expect(
      container.getByRole('button', { name: 'Gerar etiqueta PDF' }),
    ).toHaveCount(0);
  });
});

test('porções de uma preparação saem com o mesmo modelo de etiqueta', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await produce(page);
    await openArea(page, 'Validade');
    const row = page
      .getByRole('list', { name: 'Recipientes e validade' })
      .getByRole('listitem')
      .filter({ hasText: 'Caldo de teste' });
    // Fatia 7.5: preparação só é porcionada, e a porção leva a validade do lote (sem campo de data).
    await row.getByRole('button', { name: 'Porcionar', exact: true }).click();
    const form = page.getByRole('region', { name: 'Abrir ou porcionar' });
    await expect(form).toContainText(
      'Preparação própria não é aberta: divida em porções.',
    );
    await expect(form.getByLabel('Abrir embalagem')).toBeHidden();
    await expect(form.getByLabel('Validade após a abertura')).toHaveCount(0);
    const [y, m, d] = localDate(2).split('-');
    await expect(form).toContainText(`Validade da porção: ${d}/${m}/${y}`);
    await form.getByRole('button', { name: 'Dividir igualmente' }).click();
    await form
      .getByRole('combobox', { name: 'Manipulado por' })
      .selectOption({ label: 'Ana Teste' });
    await form.getByRole('button', { name: 'Revisar registro' }).click();
    await page.getByRole('button', { name: 'Confirmar registro' }).click();
    const result = page.getByRole('region', {
      name: 'Resultado da manipulação',
    });
    await expect(result).toContainText('Porcionamento registrada');
    const pdf = await download(
      page,
      testInfo,
      result.getByRole('button', { name: 'Baixar PDF de todas' }),
      'porcoes.pdf',
    );
    for (const text of [
      'PREPARAÇÃO PRÓPRIA',
      'Produzido por: Ana Teste',
      'Quantidade da porção: 3 l',
      'Porção 1 de 2',
      'Porção 2 de 2',
    ])
      expect(has(pdf.bytes, text), text).toBe(true);
    expect(has(pdf.bytes, 'PRODUTO FRACIONADO')).toBe(false);
    // Depois do porcionamento, a produção não pode mais ser anulada (D-051).
    await openArea(page, 'Produção');
    const productions = page
      .getByRole('region', { name: 'Produção da cozinha' })
      .getByRole('list', { name: 'Produções recentes' });
    await productions.getByRole('button', { name: 'Anular produção' }).click();
    const voidForm = page.getByRole('form', { name: /Anular produção C-/ });
    await voidForm.getByLabel('Motivo da anulação').fill('Teste');
    await voidForm.getByRole('button', { name: 'Confirmar anulação' }).click();
    await expect(voidForm.getByRole('alert')).toContainText(
      'Use o descarte com motivo.',
    );
  });
});

// Fatia 7.6: o proprietário muda as configurações da unidade e o colaborador passa a registrar a
// própria produção; anular continua só do proprietário.
test('colaborador registra a própria produção quando a unidade permite', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Unidade');
    const settings = page.getByRole('region', {
      name: 'Configurações da unidade',
    });
    await expect(settings).toContainText(
      'Quem registra produção: Só o proprietário',
    );
    await settings
      .getByRole('button', { name: 'Alterar configurações' })
      .click();
    await settings
      .getByLabel('Cada colaborador registra a própria produção')
      .check();
    await settings
      .getByLabel('Janela de registro da produção (minutos)')
      .fill('90');
    await settings
      .getByRole('button', { name: 'Revisar configurações' })
      .click();
    await expect(
      settings.getByRole('region', { name: 'Revisão das configurações' }),
    ).toContainText(
      'Janela de registro da produção: 2 horas → 1 hora e 30 minutos',
    );
    await settings
      .getByRole('button', { name: 'Confirmar configurações' })
      .click();
    await expect(settings.getByRole('status')).toContainText(
      'Configurações salvas.',
    );

    // O proprietário cadastra a preparação e define o nome de exibição do colaborador.
    await openArea(page, 'Preparações próprias');
    const catalog = page.getByRole('region', {
      name: 'Preparações próprias',
      exact: true,
    });
    await catalog.getByRole('button', { name: 'Nova preparação' }).click();
    await catalog.getByLabel('Nome da preparação').fill('Caldo de teste');
    await catalog.getByLabel('Unidade de medida').selectOption('l');
    await catalog
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('refrigerated');
    await catalog.getByRole('button', { name: 'Cadastrar preparação' }).click();
    await expect(catalog).toContainText('Caldo de teste — l — Refrigerado');
    await openArea(page, 'Produção');
    const panel = page.getByRole('region', { name: 'Produção da cozinha' });
    await panel.getByRole('button', { name: 'Registrar produção' }).click();
    const ownerForm = panel.getByRole('form', { name: 'Registrar produção' });
    await ownerForm
      .getByLabel('Pessoa sem nome de exibição')
      .selectOption({ label: 'Colaborador (sem nome)' });
    await ownerForm.getByLabel('Nome (até 40 caracteres)').fill('Bia Teste');
    await ownerForm.getByRole('button', { name: 'Definir nome' }).click();
    await expect(ownerForm.getByLabel('Produzida por')).toContainText(
      'Bia Teste',
    );
    await page.getByRole('button', { name: 'Sair', exact: true }).click();

    await signIn(page, users[2]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    // O colaborador não vê o cadastro; vê as regras da unidade em Configurações.
    await expect(
      page
        .getByRole('navigation', { name: 'Áreas da unidade' })
        .getByRole('link', { name: 'Recebimentos' }),
    ).toHaveCount(0);
    await openArea(page, 'Unidade');
    await expect(settings).toContainText(
      'Somente o proprietário muda as configurações da unidade.',
    );
    await openArea(page, 'Produção');
    await expect(panel).toContainText(
      'Você registra só a própria produção. Somente o proprietário anula produção.',
    );
    await panel.getByRole('button', { name: 'Registrar produção' }).click();
    const form = panel.getByRole('form', { name: 'Registrar produção' });
    await form
      .getByLabel('Preparação')
      .selectOption({ label: 'Caldo de teste (l)' });
    await form.getByLabel('Quantidade produzida (l)').fill('4');
    await form.getByLabel('Validade', { exact: true }).fill(localDate(2));
    await expect(form.getByLabel('Produzida por')).toHaveValue(users[2].id);
    await form.getByRole('button', { name: 'Revisar produção' }).click();
    const review = panel.getByRole('region', { name: 'Revisão da produção' });
    await expect(review).toContainText('Produzida por: Bia Teste');
    await review.getByRole('button', { name: 'Confirmar produção' }).click();
    await expect(
      panel.getByRole('region', { name: 'Resultado da produção' }),
    ).toContainText(/Produção registrada no recipiente C-\d{6}/);
    const productions = panel.getByRole('list', { name: 'Produções recentes' });
    await expect(productions).toContainText('por Bia Teste');
    await expect(
      productions.getByRole('button', { name: 'Anular produção' }),
    ).toHaveCount(0);
  });
});

// Fatia 7.7: o proprietário define a janela de uma preparação no catálogo e a tela de produção passa a
// usar essa janela no lugar da janela da unidade.
test('janela de registro própria da preparação vale na tela de produção', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Preparações próprias');
    const catalog = page.getByRole('region', {
      name: 'Preparações próprias',
      exact: true,
    });
    await catalog.getByRole('button', { name: 'Nova preparação' }).click();
    await catalog.getByLabel('Nome da preparação').fill('Caldo de teste');
    await catalog.getByLabel('Unidade de medida').selectOption('l');
    await catalog
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('refrigerated');
    await catalog.getByRole('button', { name: 'Cadastrar preparação' }).click();
    await expect(catalog).toContainText('janela de registro: a da unidade');
    await catalog
      .getByRole('button', { name: 'Janela de registro de Caldo de teste' })
      .click();
    await catalog
      .getByLabel('Janela de registro da produção de Caldo de teste (minutos)')
      .fill('240');
    await catalog
      .getByRole('button', { name: 'Salvar janela de Caldo de teste' })
      .click();
    await expect(catalog).toContainText('janela de registro: 4 horas');

    await openArea(page, 'Produção');
    const panel = page.getByRole('region', { name: 'Produção da cozinha' });
    await panel.getByRole('button', { name: 'Registrar produção' }).click();
    const form = panel.getByRole('form', { name: 'Registrar produção' });
    await form
      .getByLabel('Preparação')
      .selectOption({ label: 'Caldo de teste (l)' });
    // Três horas antes do registro: dentro da janela de 4 horas do caldo, fora da de 2 horas da unidade.
    const three = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const local = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
    })
      .format(three)
      .replace(' ', 'T');
    await form.getByLabel(/^Produzida em/).fill(local);
    await expect(form.getByLabel('Justificativa do atraso')).toHaveCount(0);
    const five = new Date(Date.now() - 5 * 60 * 60 * 1000);
    await form.getByLabel(/^Produzida em/).fill(
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
        .format(five)
        .replace(' ', 'T'),
    );
    await expect(
      form.getByText(/Registro mais de 4 horas depois da produção/),
    ).toBeVisible();
    await expect(form.getByLabel('Justificativa do atraso')).toBeVisible();
  });
});

test('produção sem etiqueta baixada é avisada e o download tira o aviso', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ client, users, scopeA }) => {
    // Produção registrada há 90 minutos (limite padrão da unidade: 1 hora), sem etiqueta baixada.
    const owner = client();
    const signed = await owner.auth.signInWithPassword({
      email: users[0].email,
      password: users[0].password,
    });
    expect(signed.error).toBeNull();
    const scope = {
      p_organization_id: scopeA.organization_id,
      p_establishment_id: scopeA.establishment_id,
    };
    const product = await owner
      .from('products')
      .insert({
        ...scopeA,
        name: 'Caldo de teste',
        unit: 'l',
        kind: 'preparation',
      })
      .select('id')
      .single();
    expect(product.error).toBeNull();
    for (const call of [
      owner.rpc('set_product_storage_condition', {
        ...scope,
        p_product_id: product.data.id,
        p_storage_condition: 'refrigerated',
      }),
      owner.rpc('set_member_display_name', {
        p_organization_id: scopeA.organization_id,
        p_user_id: users[0].id,
        p_display_name: 'Ana Teste',
      }),
    ])
      expect((await call).error).toBeNull();
    const produced = await owner.rpc('register_production', {
      ...scope,
      p_product_id: product.data.id,
      p_quantity: 6,
      p_expiry_date: localDate(2),
      p_produced_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      p_handled_by: users[0].id,
      p_note: null,
      p_late_reason: null,
      p_intent_id: randomUUID(),
    });
    expect(produced.error).toBeNull();

    await page.goto('/');
    await signIn(page, users[0]);
    await page.getByRole('button', { name: 'Abrir Cozinha principal' }).click();
    await openArea(page, 'Produção');
    const panel = page.getByRole('region', { name: 'Produção da cozinha' });
    const productions = panel.getByRole('list', { name: 'Produções recentes' });
    await expect(productions).toContainText(
      /sem download de etiqueta registrado há 1 hora e 3\d minutos \(acima de 1 hora\)/,
    );
    await expect(panel).toContainText(
      '1 produção está sem download de etiqueta registrado há mais de 1 hora',
    );

    await download(
      page,
      testInfo,
      productions.getByRole('button', { name: /^Baixar etiqueta \(C-/ }),
      'aviso.pdf',
    );
    await expect(productions).not.toContainText(
      'sem download de etiqueta registrado há',
    );
    await expect(panel).not.toContainText(
      'está sem download de etiqueta registrado',
    );
  });
});

test('registrar a temperatura opcional da produção pela tela, sem avaliação', async ({
  page,
}) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    const panel = await produce(page);
    await expect(
      panel.getByRole('region', { name: 'Resultado da produção' }),
    ).toContainText(/Produção registrada no recipiente C-\d{6}/);
    const productions = panel.getByRole('list', { name: 'Produções recentes' });
    await productions
      .getByRole('button', { name: /^Registrar temperatura C-/ })
      .click();
    const form = panel.getByRole('form', { name: /^Registrar temperatura C-/ });
    await expect(form).toContainText('O sistema não avalia');
    await form.getByLabel('Momento da medição').selectOption('cooling_end');
    await form.getByLabel('Temperatura medida (°C)').fill('4,5');
    await form
      .getByRole('button', { name: 'Registrar temperatura medida' })
      .click();
    await expect(panel).toContainText('Temperatura registrada.');
    await expect(
      productions.getByRole('list', { name: /^Temperaturas de C-/ }),
    ).toContainText(
      /Fim do resfriamento: 4,5 °C, medida em .* registrada por Ana Teste \(informada; o sistema não avalia\)/,
    );
    // Valores extremos também só são registrados.
    await productions
      .getByRole('button', { name: /^Registrar temperatura C-/ })
      .click();
    await form.getByLabel('Momento da medição').selectOption('reheating');
    await form.getByLabel('Temperatura medida (°C)').fill('80');
    await form
      .getByRole('button', { name: 'Registrar temperatura medida' })
      .click();
    await expect(
      productions.getByRole('list', { name: /^Temperaturas de C-/ }),
    ).toContainText('Reaquecimento: 80,0 °C');
    await expect(panel).not.toContainText(/conforme/i);
  });
});
