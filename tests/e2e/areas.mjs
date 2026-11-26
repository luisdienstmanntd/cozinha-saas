const labels = {
  Validade: 'Validades',
  Receber: 'Recebimentos',
  Locais: 'Locais de armazenamento',
};

export function areaLink(page, name) {
  const label = labels[name] ?? name;
  // Desktop: menu lateral. Celular (PR-12): barra inferior, ou a folha "Mais" para as demais áreas.
  return page
    .getByRole('navigation', { name: 'Áreas da unidade' })
    .getByRole('link', { name: label, exact: true })
    .or(
      page
        .getByRole('dialog', { name: 'Mais áreas' })
        .getByRole('link', { name: label, exact: true }),
    );
}

export async function openArea(page, name) {
  // Depois de mudar o tamanho da janela, a tela troca menu lateral e barra inferior com um pequeno
  // atraso: espera o layout certo para a largura atual antes de procurar o link.
  const compact = (page.viewportSize()?.width ?? 1280) <= 899;
  await page
    .locator(compact ? '.mesa-bottom-nav' : '.mesa-sidebar')
    .and(page.locator(':visible'))
    .first()
    .waitFor({ state: 'visible' });
  const more = page.getByRole('button', { name: 'Mais', exact: true });
  const link = areaLink(page, name);
  if (
    !(await link.isVisible()) &&
    (await more.isVisible()) &&
    (await more.getAttribute('aria-expanded')) === 'false'
  )
    await more.click();
  const group = ['Produtos', 'Fornecedores', 'Preparações próprias'].includes(
    name,
  )
    ? 'Cadastros'
    : ['Unidade', 'Equipe', 'Organização'].includes(name)
      ? 'Configurações'
      : null;
  if (group && !(await link.isVisible()))
    await page.getByRole('button', { name: group, exact: true }).click();
  await link.click();
}

export async function newCatalogItem(page, area) {
  const actions = {
    Produtos: 'Novo produto',
    Fornecedores: 'Novo fornecedor',
    'Preparações próprias': 'Nova preparação',
  };
  await openArea(page, area);
  await page.getByRole('button', { name: actions[area], exact: true }).click();
}

export async function chooseUnitList(page) {
  await page
    .getByRole('combobox', { name: 'Unidade', exact: true })
    .selectOption('');
}

// D-070 (Mesa): e-mail da sessão e "Atualizar acesso" ficam no menu "Minha conta".
export async function openAccount(page) {
  const account = page
    .getByRole('region', { name: 'Sessão' })
    .getByText('Minha conta', { exact: true });
  const details = page.locator('details.mesa-account');
  if (!(await details.evaluate((element) => element.open)))
    await account.click();
}
