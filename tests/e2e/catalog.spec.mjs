import { expect, test } from '@playwright/test';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';
import { checked } from '../../scripts/local-supabase.mjs';
import { readFile } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';

test('proprietário cadastra catálogo, lote e etiqueta com acesso autenticado', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  let duplicateClientWarnings = 0;
  page.on('console', (message) => {
    if (message.text().includes('Multiple GoTrueClient instances detected'))
      duplicateClientWarnings++;
  });
  await withCatalogFixture(async ({ users, admin, scopeA }) => {
    async function signIn() {
      await page.getByLabel('E-mail').fill(users[0].email);
      await page.getByLabel('Senha').fill(users[0].password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Catálogo de Cozinha principal' }),
      ).toBeVisible();
      await expect(page.getByText('Cozinha de outra empresa')).toHaveCount(0);
    }
    await page.goto('/');
    await signIn();
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    await page.getByLabel('Nome do produto').fill('Arroz de teste');
    await page.getByLabel('Unidade de medida').selectOption('kg');
    // Fatia 6.5b: conservação definida no cadastro, exigida no recebimento.
    await page
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('ambient');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(
      page.getByText('Arroz de teste — kg — Ambiente'),
    ).toBeVisible();
    await page.getByLabel('Nome do fornecedor').fill('Horta de teste');
    await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
    await expect(
      page
        .getByRole('region', { name: 'Fornecedores' })
        .getByText('Horta de teste', { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole('combobox', { name: 'Produto', exact: true })
        .locator('option', { hasText: 'Arroz de teste' }),
    ).toHaveCount(1);
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
    await page.getByLabel('Quantidade recebida').fill('1.25');
    await page.getByLabel('Data de validade').fill('2030-01-01');
    await page.getByRole('button', { name: 'Registrar recebimento' }).click();
    await expect(page.getByText('Recebimento registrado.')).toBeVisible();
    await expect(page.getByText(/lote 0001/)).toBeVisible();
    await page.getByRole('button', { name: 'Abrir etiqueta' }).click();
    const label = page.getByRole('region', { name: 'Recipiente', exact: true });
    await expect(label.getByText(/Identificação:/)).toBeVisible();
    const id = (await label.getByText(/Identificação:/).innerText()).replace(
      'Identificação: ',
      '',
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const search = page.getByRole('searchbox', {
      name: 'Buscar por produto, lote, código ou ID do recipiente',
    });
    const results = page.getByRole('list', { name: 'Recipientes e validade' });
    await search.fill('arroz de teste');
    await expect(results.getByText(/lote 0001/)).toBeVisible();
    await search.fill('0001');
    await expect(results.getByText(/Arroz de teste/)).toBeVisible();
    await search.fill(id);
    await expect(results.getByText(`recipiente ${id}`)).toBeVisible();
    await search.clear();
    const waitDownload = page.waitForEvent('download');
    await label.getByRole('button', { name: 'Gerar etiqueta PDF' }).click();
    const pdf = await waitDownload;
    const pdfPath = testInfo.outputPath('etiqueta.pdf');
    await pdf.saveAs(pdfPath);
    const bytes = await readFile(pdfPath);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.includes(Buffer.from('Arroz de teste'))).toBe(true);
    expect(bytes.includes(Buffer.from('0001'))).toBe(true);
    expect(bytes.includes(Buffer.from('Validade: 01/01/2030'))).toBe(true);
    expect(bytes.includes(Buffer.from('Quantidade inicial:'))).toBe(true);
    expect(pdf.suggestedFilename()).toBe(`etiqueta-${id}.pdf`);
    await page.getByRole('button', { name: 'Ver movimentações' }).click();
    const movements = page.getByRole('region', { name: 'Movimentações' });
    await expect(
      movements.getByText('Saldo registrado: 1.25 kg'),
    ).toBeVisible();
    await movements.getByLabel('Quantidade da saída').fill('0.5');
    await movements.getByRole('button', { name: 'Registrar saída' }).click();
    await page
      .getByRole('button', { name: 'Gerenciar unidades de Empresa de teste A' })
      .click();
    await page
      .getByRole('button', { name: 'Renomear Cozinha auxiliar' })
      .click();
    await expect(page.getByText('Nome da unidade atualizado.')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Movimentações' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver movimentações' }).click();
    await expect(movements.getByText(/Tentativa pendente/)).toBeVisible();
    await movements.getByRole('button', { name: 'Repetir tentativa' }).click();
    await expect(
      movements.getByText('Saldo registrado: 0.75 kg'),
    ).toBeVisible();
    await expect(movements.getByText(/Consumo — 0.5 kg/)).toBeVisible();
    // Fatia 6.2: a linha do painel mostra o saldo do servidor, não a quantidade recebida.
    await expect(results.getByText(/saldo 0.75 kg de 1.25 kg/)).toBeVisible();
    await page.getByLabel('Nome do fornecedor').fill('HORTA DE TESTE');
    await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Esse nome já está cadastrado neste estabelecimento.',
    );
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha auxiliar' })
      .click();
    await expect(page.getByText('Nenhum produto cadastrado.')).toBeVisible();
    await expect(page.getByText('Nenhum fornecedor cadastrado.')).toBeVisible();
    await expect(page.getByText('Arroz de teste — kg')).toHaveCount(0);
    await expect(
      page
        .getByRole('region', { name: 'Fornecedores' })
        .getByText('Horta de teste', { exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await signIn();
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    await expect(page.getByText('Arroz de teste — kg')).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Fornecedores' })
        .getByText('Horta de teste', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/lote 0001/)).toBeVisible();
    await page.getByRole('button', { name: 'Ver movimentações' }).click();
    await expect(page.getByText('Saldo registrado: 0.75 kg')).toBeVisible();
    const reopened = page.getByRole('region', { name: 'Movimentações' });
    await reopened.getByLabel('Tipo de saída').selectOption('discard');
    await reopened.getByLabel('Quantidade da saída').fill('0.75');
    await reopened.getByLabel('Motivo').fill('Dano');
    await reopened.getByRole('button', { name: 'Registrar saída' }).click();
    await reopened.getByRole('button', { name: 'Confirmar saída' }).click();
    await expect(reopened.getByText('Saldo registrado: 0 kg')).toBeVisible();
    await expect(reopened.getByText(/Descarte — 0.75 kg/)).toBeVisible();
    const consumed = reopened
      .getByRole('listitem')
      .filter({ hasText: 'Consumo — 0.5 kg' });
    await consumed.getByRole('button', { name: 'Anular registro' }).click();
    await reopened
      .getByLabel('Motivo da anulação')
      .fill('Lançamento incorreto');
    await reopened.getByRole('button', { name: 'Revisar anulação' }).click();
    await expect(reopened.getByText(/não recupera alimento/)).toBeVisible();
    await reopened.getByRole('button', { name: 'Confirmar anulação' }).click();
    await expect(reopened.getByText('Saldo registrado: 0.5 kg')).toBeVisible();
    await expect(consumed).toContainText('anulado');
    await expect(reopened.getByText(/Anulação do registro/)).toBeVisible();
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Entrar', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Arroz de teste — kg')).toHaveCount(0);
    await page.goto(`/recipiente/${id}`);
    await expect(
      page.getByRole('region', { name: 'Recipiente', exact: true }),
    ).toHaveCount(0);
    await page.getByLabel('E-mail').fill(users[1].email);
    await page.getByLabel('Senha').fill(users[1].password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Recipiente indisponível ou sem acesso.',
    );
    // E2E 32: usuário de outra empresa não vê produto, lote nem saldo do recipiente de A.
    await expect(page.getByText(/Saldo atual/)).toHaveCount(0);
    await expect(page.getByText(/Arroz de teste/)).toHaveCount(0);
    await expect(page.getByText(/0001/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await signIn();
    const resolved = page.getByRole('region', {
      name: 'Recipiente',
      exact: true,
    });
    await expect(resolved.getByText(`Identificação: ${id}`)).toBeVisible();
    // Fatia 6.2: a rota do QR mostra o saldo atual (1.25 − 0.5 − 0.75 + 0.5 anulado) e o código curto.
    await expect(resolved.getByText('Saldo atual: 0.5 kg')).toBeVisible();
    await expect(resolved.getByText(/^Código: C-\d{6,}$/)).toBeVisible();
    const secondDownload = page.waitForEvent('download');
    await resolved.getByRole('button', { name: 'Gerar etiqueta PDF' }).click();
    expect((await secondDownload).suggestedFilename()).toBe(
      `etiqueta-${id}.pdf`,
    );
    const containers = checked(
      await admin
        .from('containers')
        .select('id')
        .eq('organization_id', scopeA.organization_id),
    );
    const batches = checked(
      await admin
        .from('batch_receipts')
        .select('quantity')
        .eq('organization_id', scopeA.organization_id),
    );
    expect(containers).toEqual([{ id }]);
    expect(batches).toEqual([{ quantity: 1.25 }]);
    checked(
      await admin
        .from('memberships')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', users[0].id),
    );
    await page.getByRole('button', { name: 'Atualizar acesso' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Nenhum vínculo ativo. Solicite acesso ao responsável.',
    );
    await expect(
      page.getByRole('region', { name: 'Recipiente', exact: true }),
    ).toHaveCount(0);
  });
  expect(duplicateClientWarnings).toBe(0);
});

test('modelo PDF comporta nome longo com acentuação', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { makeLabelPdf } =
      await import('/src/features/labels/application/pdf.ts');
    const blob = await makeLabelPdf(
      {
        id: '12345678-1234-4234-8234-123456789abc',
        short_code: 'C-000001',
        balance: 1.25,
        batch_receipts: {
          source_code: 'REMESSA DE TESTE 0001',
          quantity: 1.25,
          unit: 'kg',
          expiry_date: '2027-01-01',
          expiry_origin: 'original',
          products: { name: 'Açúcar integral de cozinha '.repeat(4).trim() },
        },
      },
      globalThis.location.origin,
    );
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const pdf = Buffer.from(result);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  await writeFile(testInfo.outputPath('etiqueta-longa.pdf'), pdf);
});
