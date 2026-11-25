// D-075: tela inicial da Mesa só com as unidades; nome da organização e gestão de unidades ficam em
// Configurações > Organização. Dados sintéticos.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IdentityHome } from './IdentityHome';
import type { IdentityGateway } from '../application/identityGateway';
import type { Access } from '../domain/identity';

const userId = '10000000-0000-0000-0000-000000000001';
function accessWith(
  establishments: Access[number]['establishments'],
  role: 'owner' | 'member' = 'owner',
): Access {
  return [
    {
      id: '20000000-0000-0000-0000-000000000001',
      name: 'Restaurante Exemplo',
      establishments,
      memberships: [{ user_id: userId, role }],
    },
  ];
}
const units = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    name: 'Cozinha central',
    timezone: 'America/Sao_Paulo',
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    name: 'Cozinha do salão',
    timezone: 'America/Manaus',
  },
];
function gateway(access: Access): IdentityGateway {
  return {
    signIn: vi.fn().mockResolvedValue(userId),
    signOut: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(access),
    rename: vi.fn().mockResolvedValue(undefined),
    onSignOut: vi.fn().mockReturnValue(() => {}),
  };
}
async function login() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('E-mail'), 'pessoa@example.invalid');
  await user.type(screen.getByLabelText('Senha'), 'senha-de-exemplo');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}
function renderShell(access: Access) {
  const tools = vi.fn(() => (
    <button type="button">Gerenciar unidades de exemplo</button>
  ));
  render(
    <IdentityHome
      gateway={gateway(access)}
      operationalShell
      renderCatalog={() => <p>Área da unidade</p>}
      renderOrganizationTools={tools}
    />,
  );
  return tools;
}

describe('início da Mesa (D-075)', () => {
  it('lista cada unidade com o nome legível do fuso e Abrir, sem ferramentas da organização', async () => {
    const tools = renderShell(accessWith(units));
    await login();
    const list = await screen.findByRole('list', {
      name: 'Unidades de Restaurante Exemplo',
    });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Cozinha central');
    expect(items[0]).toHaveTextContent(/Horário .*Brasília/);
    expect(items[1]).toHaveTextContent(/Amazonas/);
    expect(list).not.toHaveTextContent('America/');
    expect(
      within(items[0]!).getByRole('button', { name: 'Abrir Cozinha central' }),
    ).toBeVisible();
    expect(screen.getByText('Papel: Proprietário')).toBeVisible();
    // Nome da organização e gestão de unidades não aparecem no início.
    expect(screen.queryByLabelText('Nome da organização')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Gerenciar unidades/ }),
    ).toBeNull();
    expect(tools).not.toHaveBeenCalled();
  });

  it('sem unidade, o proprietário ainda encontra a gestão de unidades no início', async () => {
    const tools = renderShell(accessWith([]));
    await login();
    expect(
      await screen.findByText('Nenhuma unidade cadastrada.'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Gerenciar unidades de exemplo' }),
    ).toBeVisible();
    expect(tools).toHaveBeenCalled();
  });

  it('em Organização, o proprietário vê título, nome da organização e unidades', async () => {
    const access = accessWith(units);
    render(
      <IdentityHome
        gateway={gateway(access)}
        operationalShell
        renderCatalog={(_o, _e, _c, _u, _t, unit) => (
          <div>{unit.organizationTools}</div>
        )}
        renderOrganizationTools={() => (
          <button type="button">Gerenciar unidades de exemplo</button>
        )}
      />,
    );
    const user = await login();
    await user.click(
      await screen.findByRole('button', { name: 'Abrir Cozinha central' }),
    );
    const page = await screen.findByRole('region', { name: 'Organização' });
    expect(
      within(page).getByRole('heading', { name: 'Organização', level: 2 }),
    ).toBeVisible();
    expect(within(page).getByLabelText('Nome da organização')).toHaveValue(
      'Restaurante Exemplo',
    );
    expect(
      within(page).getByRole('heading', { name: 'Unidades', level: 3 }),
    ).toBeVisible();
    expect(
      within(page).getByRole('button', {
        name: 'Gerenciar unidades de exemplo',
      }),
    ).toBeVisible();
  });
});
