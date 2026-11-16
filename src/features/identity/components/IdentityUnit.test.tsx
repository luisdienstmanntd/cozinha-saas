import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityHome } from './IdentityHome';
import type { IdentityGateway } from '../application/identityGateway';
import type { Access } from '../domain/identity';

const userId = '10000000-0000-4000-8000-000000000001';
const unitId = '30000000-0000-4000-8000-000000000001';
const otherId = '30000000-0000-4000-8000-000000000002';
const access: Access = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Empresa A',
    establishments: [
      { id: unitId, name: 'Cozinha A', timezone: 'America/Sao_Paulo' },
      { id: otherId, name: 'Cozinha B', timezone: 'America/Sao_Paulo' },
    ],
    memberships: [{ user_id: userId, role: 'owner' }],
  },
];
function gateway(): IdentityGateway {
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
  await user.type(screen.getByLabelText('E-mail'), 'ana@example.invalid');
  await user.type(screen.getByLabelText('Senha'), 'senha-de-teste');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}
const renderUnit = vi.fn(
  (
    _org: string,
    unit: string,
    owner: boolean,
    _user: string,
    _tz: string,
    context: { unitName: string; organizationName: string },
  ) => (
    <p>
      Conteúdo de {context.unitName} ({owner ? 'dono' : 'colaborador'}, {unit})
    </p>
  ),
);

describe('unidade aberta (V1)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    renderUnit.mockClear();
  });
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('abrir uma unidade mostra o cabeçalho com Sair e grava a unidade no endereço', async () => {
    render(<IdentityHome gateway={gateway()} renderCatalog={renderUnit} />);
    const user = await login();
    await user.click(
      await screen.findByRole('button', { name: 'Abrir Cozinha A' }),
    );
    expect(
      screen.getByRole('region', { name: 'Unidade Cozinha A' }),
    ).toBeVisible();
    expect(screen.getByText(/Conteúdo de Cozinha A/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Sessão' })).toHaveTextContent(
      'Cozinha A',
    );
    expect(window.location.search).toBe(`?unidade=${unitId}&area=validade`);
    // Outras unidades não aparecem enquanto uma está aberta.
    expect(
      screen.queryByRole('button', { name: 'Abrir Cozinha B' }),
    ).toBeNull();
  });

  it('Trocar de unidade volta à lista e limpa o endereço; voltar do navegador reabre', async () => {
    render(<IdentityHome gateway={gateway()} renderCatalog={renderUnit} />);
    const user = await login();
    await user.click(
      await screen.findByRole('button', { name: 'Abrir Cozinha A' }),
    );
    await user.click(screen.getByRole('button', { name: 'Trocar de unidade' }));
    expect(
      await screen.findByRole('button', { name: 'Abrir Cozinha B' }),
    ).toBeVisible();
    expect(window.location.search).toBe('');
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(await screen.findByText(/Conteúdo de Cozinha A/)).toBeVisible();
  });

  it('endereço com a unidade abre direto depois do login; unidade sem acesso não abre', async () => {
    window.history.replaceState(null, '', `/?unidade=${otherId}&area=locais`);
    const { unmount } = render(
      <IdentityHome gateway={gateway()} renderCatalog={renderUnit} />,
    );
    await login();
    expect(await screen.findByText(/Conteúdo de Cozinha B/)).toBeVisible();
    unmount();

    window.history.replaceState(
      null,
      '',
      '/?unidade=30000000-0000-4000-8000-0000000000ff',
    );
    render(<IdentityHome gateway={gateway()} renderCatalog={renderUnit} />);
    await login();
    expect(
      await screen.findByRole('button', { name: 'Abrir Cozinha A' }),
    ).toBeVisible();
    expect(screen.queryByText(/Conteúdo de/)).toBeNull();
  });

  it('Sair tira a unidade do endereço', async () => {
    render(<IdentityHome gateway={gateway()} renderCatalog={renderUnit} />);
    const user = await login();
    await user.click(
      await screen.findByRole('button', { name: 'Abrir Cozinha A' }),
    );
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(window.location.search).toBe('');
  });
});
