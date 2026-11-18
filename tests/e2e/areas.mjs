// V1: a unidade aberta se divide em áreas; os testes escolhem a área pelo menu de navegação.
export function areaLink(page, name) {
  return page
    .getByRole('navigation', { name: 'Áreas da unidade' })
    .getByRole('link', { name, exact: true });
}

export async function openArea(page, name) {
  await areaLink(page, name).click();
}
