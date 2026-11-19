const labels = {
  Validade: 'Validades',
  Receber: 'Recebimentos',
  Locais: 'Estoque e locais',
};

export function areaLink(page, name) {
  return page
    .getByRole('navigation', { name: 'Áreas da unidade' })
    .getByRole('link', { name: labels[name] ?? name, exact: true });
}

export async function openArea(page, name) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  const link = areaLink(page, name);
  if (!(await link.isVisible()) && (await menu.isVisible())) await menu.click();
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
