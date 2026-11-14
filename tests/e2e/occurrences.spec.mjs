import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { withCatalogFixture } from '../../scripts/catalog-fixture.mjs';

// Fatia 6.5b, E2E 29 e 33 do desenho (seção 8): recebimento sem medição gera etiqueta com faixa,
// baixa recusada na tela, membro vê o bloqueio sem a ação, proprietário decide e a reimpressão sai sem
// a faixa. Nenhum texto classifica a temperatura nem afirma conformidade sanitária.
async function signIn(page, user) {
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(user.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Catálogo de Cozinha principal' }),
  ).toBeVisible();
}

async function labelPdf(page, testInfo, name) {
  const label = page.getByRole('region', { name: 'Recipiente', exact: true });
  const waitDownload = page.waitForEvent('download');
  await label.getByRole('button', { name: 'Gerar etiqueta PDF' }).click();
  const download = await waitDownload;
  const path = testInfo.outputPath(name);
  await download.saveAs(path);
  return readFile(path);
}

test('recebimento sem medição: bloqueio, recusa de baixa, membro sem decisão, liberação e reimpressão', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  await withCatalogFixture(async ({ users }) => {
    await page.goto('/');
    await signIn(page, users[0]);
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    await page.getByLabel('Nome do produto').fill('Frango de teste');
    await page.getByLabel('Unidade de medida').selectOption('kg');
    await page
      .getByRole('combobox', { name: 'Conservação', exact: true })
      .selectOption('refrigerated');
    await page.getByRole('button', { name: 'Cadastrar produto' }).click();
    await expect(
      page.getByText('Frango de teste — kg — Refrigerado'),
    ).toBeVisible();
    await page.getByLabel('Nome do fornecedor').fill('Granja de teste');
    await page.getByRole('button', { name: 'Cadastrar fornecedor' }).click();
    await expect(
      page
        .getByRole('combobox', { name: 'Fornecedor', exact: true })
        .locator('option', { hasText: 'Granja de teste' }),
    ).toHaveCount(1);

    // Recebimento sem medição, com justificativa.
    await page
      .getByRole('combobox', { name: 'Produto', exact: true })
      .selectOption({ label: 'Frango de teste (kg)' });
    await expect(
      page.getByText('Conservação: Refrigerado (definida no produto)'),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Fornecedor', exact: true })
      .selectOption({ label: 'Granja de teste' });
    await page.getByLabel('Lote de origem').fill('F-29');
    await page.getByLabel('Quantidade recebida').fill('4');
    await page.getByLabel('Data de validade').fill('2030-01-01');
    await page.getByLabel('Não foi possível medir').check();
    await expect(page.getByRole('note')).toHaveText(
      'O recebimento ficará bloqueado para uso até a decisão do responsável.',
    );
    await page
      .getByLabel('Justificativa (por que não foi possível medir)')
      .fill('Termômetro sem pilha');
    await page.getByRole('button', { name: 'Registrar recebimento' }).click();
    await expect(
      page.getByText(
        'Recebimento registrado. O recebimento ficou bloqueado para uso até a decisão do proprietário.',
      ),
    ).toBeVisible();

    const blocks = page.getByRole('region', {
      name: 'Bloqueios e ocorrências',
    });
    await expect(blocks).toContainText('BLOQUEADO - aguardando decisão');
    await expect(blocks).toContainText(
      'Motivo registrado: Termômetro sem pilha',
    );
    const rows = page.getByRole('list', { name: 'Recipientes e validade' });
    await expect(rows.getByText(/lote F-29/)).toContainText(
      'BLOQUEADO - aguardando decisão',
    );

    // Etiqueta com faixa.
    await page.getByRole('button', { name: 'Abrir etiqueta' }).click();
    const label = page.getByRole('region', { name: 'Recipiente', exact: true });
    await expect(
      label.getByText('BLOQUEADO - aguardando decisão'),
    ).toBeVisible();
    const blockedPdf = await labelPdf(page, testInfo, 'bloqueada.pdf');
    expect(blockedPdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(blockedPdf.includes(Buffer.from('(BLOQUEADO)'))).toBe(true);

    // Baixa recusada na tela, com a mensagem do banco.
    await page.getByRole('button', { name: 'Ver movimentações' }).click();
    const movements = page.getByRole('region', { name: 'Movimentações' });
    await expect(movements).toContainText(
      'consumo e manipulação ficam recusados até a decisão do proprietário',
    );
    await movements.getByLabel('Quantidade da saída').fill('1');
    await movements.getByRole('button', { name: 'Registrar saída' }).click();
    await movements.getByRole('button', { name: 'Confirmar saída' }).click();
    await expect(movements.getByRole('alert')).toContainText(
      'Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.',
    );
    await expect(movements.getByText('Saldo registrado: 4 kg')).toBeVisible();

    // E2E 33: membro vê o bloqueio e não a ação de decisão.
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await signIn(page, users[2]);
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    await expect(blocks).toContainText('BLOQUEADO - aguardando decisão');
    await expect(blocks).toContainText(
      'Somente o proprietário registra a decisão.',
    );
    await expect(
      page.getByRole('button', { name: 'Registrar decisão' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Registrar recebimento' }),
    ).toHaveCount(0);

    // Proprietário libera com justificativa; o bloqueio sai e a reimpressão vem sem a faixa.
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await signIn(page, users[0]);
    await page
      .getByRole('button', { name: 'Catálogo de Cozinha principal' })
      .click();
    await blocks.getByRole('button', { name: 'Registrar decisão' }).click();
    const decision = page.getByRole('form', {
      name: 'Decisão da ocorrência de Frango de teste',
    });
    await expect(decision).toContainText(
      'Decida seguindo o procedimento sanitário da cozinha.',
    );
    await decision.getByLabel('Liberar o uso').check();
    await decision
      .getByLabel('Justificativa da decisão')
      .fill('Temperatura conferida com termômetro reserva: 3 °C');
    await decision.getByRole('button', { name: 'Confirmar decisão' }).click();
    await expect(
      page.getByText('Decisão registrada: Frango de teste liberado.'),
    ).toBeVisible();
    await expect(blocks).toContainText('Nenhum recipiente bloqueado.');
    await expect(rows.getByText(/lote F-29/)).not.toContainText('BLOQUEADO');
    await page.getByRole('button', { name: 'Abrir etiqueta' }).click();
    await expect(
      label.getByRole('button', { name: 'Gerar etiqueta PDF' }),
    ).toBeVisible();
    await expect(label.getByText('BLOQUEADO - aguardando decisão')).toHaveCount(
      0,
    );
    const releasedPdf = await labelPdf(page, testInfo, 'liberada.pdf');
    expect(releasedPdf.includes(Buffer.from('BLOQUEADO'))).toBe(false);
    expect(releasedPdf.includes(Buffer.from('Frango de teste'))).toBe(true);

    // Consumo agora passa: a tentativa recusada ficou pendente na sessão e é repetida (mesmo
    // identificador, sem duplicar).
    await page.getByRole('button', { name: 'Ver movimentações' }).click();
    await expect(
      movements.getByText('Tentativa pendente: consumo de 1 kg.'),
    ).toBeVisible();
    await movements.getByRole('button', { name: 'Repetir tentativa' }).click();
    await expect(movements.getByText('Saldo registrado: 3 kg')).toBeVisible();

    // Decididas continuam consultáveis, sem "aprovado".
    await page
      .getByLabel('Mostrar todas as ocorrências, inclusive decididas')
      .check();
    await expect(blocks).toContainText('Liberado pelo proprietário');
    await expect(blocks).toContainText(
      'Justificativa: Temperatura conferida com termômetro reserva: 3 °C',
    );
    await expect(blocks).not.toContainText(/aprovad|conform/i);
  });
});
