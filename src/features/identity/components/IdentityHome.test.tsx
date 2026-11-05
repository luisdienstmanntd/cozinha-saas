import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IdentityHome } from './IdentityHome';
import type { IdentityGateway } from '../application/identityGateway';
import type { Access } from '../domain/identity';

const userId = '10000000-0000-0000-0000-000000000001';
const access: Access = [
  {
    id: '20000000-0000-0000-0000-000000000001',
    name: 'Empresa A',
    establishments: [
      {
        id: '30000000-0000-0000-0000-000000000001',
        name: 'Unidade A',
        timezone: 'America/Sao_Paulo',
      },
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
  await user.type(screen.getByLabelText('E-mail'), 'teste@example.invalid');
  await user.type(screen.getByLabelText('Senha'), 'senha-de-teste');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}
describe('acesso multiempresa', () => {
  it('entra, consulta unidades, edita nome e limpa dados ao sair', async () => {
    const service = gateway();
    render(<IdentityHome gateway={service} />);
    const user = await login();
    expect(
      await screen.findByText('Unidade A — America/Sao_Paulo'),
    ).toBeVisible();
    await user.clear(screen.getByLabelText('Nome da organização'));
    await user.type(screen.getByLabelText('Nome da organização'), 'Nome novo');
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));
    await waitFor(() =>
      expect(service.rename).toHaveBeenCalledWith(access[0]!.id, 'Nome novo'),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nome atualizado.',
    );
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(
      screen.queryByText('Unidade A — America/Sao_Paulo'),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });
  it('mostra erro de login sem dados protegidos', async () => {
    const service = gateway();
    vi.mocked(service.signIn).mockRejectedValue(new Error('Falha ao entrar.'));
    render(<IdentityHome gateway={service} />);
    await login();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Falha ao entrar.',
    );
    expect(service.load).not.toHaveBeenCalled();
  });
  it('retira dados anteriores quando acesso é revogado ou conexão falha', async () => {
    const service = gateway();
    render(<IdentityHome gateway={service} />);
    const user = await login();
    await screen.findByText('Unidade A — America/Sao_Paulo');
    vi.mocked(service.load).mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nenhum vínculo ativo.',
    );
    expect(
      screen.queryByText('Unidade A — America/Sao_Paulo'),
    ).not.toBeInTheDocument();
    vi.mocked(service.load).mockRejectedValue(new Error('Falha de conexão.'));
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Falha de conexão.',
    );
  });
  it('colaborador consulta sem formulário de edição', async () => {
    const service = gateway();
    vi.mocked(service.load).mockResolvedValue([
      { ...access[0]!, memberships: [{ user_id: userId, role: 'member' }] },
    ]);
    render(<IdentityHome gateway={service} />);
    await login();
    expect(await screen.findByText('Papel: Colaborador')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Salvar nome' }),
    ).not.toBeInTheDocument();
  });
  it('exibe falhas de gravação e logout e oculta dados', async () => {
    const service = gateway();
    render(<IdentityHome gateway={service} />);
    const user = await login();
    await screen.findByText('Unidade A — America/Sao_Paulo');
    vi.mocked(service.rename).mockRejectedValue(
      new Error('Alteração recusada.'),
    );
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Alteração recusada.',
    );
    expect(
      screen.queryByText('Unidade A — America/Sao_Paulo'),
    ).not.toBeInTheDocument();
    vi.mocked(service.signOut).mockRejectedValue(new Error('Falha ao sair.'));
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Falha ao sair.',
    );
  });
  it('expiração limpa acesso e descarta consulta pendente', async () => {
    const service = gateway();
    let expired = () => {};
    service.onSignOut = (callback) => {
      expired = callback;
      return () => {};
    };
    let resolve!: (value: Access) => void;
    vi.mocked(service.load).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<IdentityHome gateway={service} />);
    await login();
    await waitFor(() => expect(service.load).toHaveBeenCalled());
    const { act } = await import('@testing-library/react');
    await act(async () => {
      expired();
      resolve(access);
    });
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(
      screen.queryByText('Unidade A — America/Sao_Paulo'),
    ).not.toBeInTheDocument();
  });
});
