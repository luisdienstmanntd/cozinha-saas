const labels = {
  Validade: 'Validades',
  Receber: 'Recebimentos',
  Locais: 'Locais de armazenamento',
};

export function areaLink(page, name) {
  return page
    .getByRole('navigation', { name: 'Áreas da unidade' })
    .getByRole('link', { name: labels[name] ?? name, exact: true });
}

export async function openArea(page, name) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  const link = areaLink(page, name);
  if (
    !(await link.isVisible()) &&
    (await menu.isVisible()) &&
    (await menu.getAttribute('aria-expanded')) === 'false'
  )
    await menu.click();
  const group = ['Produtos', 'Fornecedores', 'Preparações próprias'].includes(
    name,
  )
    ? 'Cadastros'
    : ['Unidade', 'Organização'].includes(name)
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
