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
  it('validação local do nome não apaga unidades nem chama o servidor', async () => {
    const service = gateway();
    render(<IdentityHome gateway={service} />);
    const user = await login();
    await screen.findByText('Unidade A — America/Sao_Paulo');
    await user.clear(screen.getByLabelText('Nome da organização'));
    await user.type(screen.getByLabelText('Nome da organização'), '   ');
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Informe nome entre 1 e 120 caracteres.',
    );
    expect(screen.getByText('Unidade A — America/Sao_Paulo')).toBeVisible();
    expect(service.rename).not.toHaveBeenCalled();
    expect(service.load).toHaveBeenCalledTimes(1);
  });
  it('ferramentas da organização recebem papel e atualizam o acesso com aviso', async () => {
    const service = gateway();
    let changed!: (message: string, kind?: 'notice' | 'error') => void;
    render(
      <IdentityHome
        gateway={service}
        renderOrganizationTools={(organization, owner, onChanged) => {
          changed = onChanged;
          return (
            <p>
              Ferramentas de {organization.name}: {owner ? 'dono' : 'membro'}
            </p>
          );
        }}
      />,
    );
    await login();
    expect(
      await screen.findByText('Ferramentas de Empresa A: dono'),
    ).toBeVisible();
    const { act } = await import('@testing-library/react');
    await act(async () => changed('Unidade criada.'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Unidade criada.',
    );
    expect(service.load).toHaveBeenCalledTimes(2);
    await act(async () => changed('Confira a lista.', 'error'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confira a lista.',
    );
    expect(screen.getByText('Unidade A — America/Sao_Paulo')).toBeVisible();
    expect(service.load).toHaveBeenCalledTimes(3);
  });
  it('falha ao recarregar após gravação mantém o resultado visível', async () => {
    const service = gateway();
    let changed!: (message: string, kind?: 'notice' | 'error') => Promise<void>;
    let busyNow = false;
    render(
      <IdentityHome
        gateway={service}
        renderOrganizationTools={(_organization, _owner, onChanged, busy) => {
          changed = onChanged;
          busyNow = busy;
          return null;
        }}
      />,
    );
    await login();
    await screen.findByText('Unidade A — America/Sao_Paulo');
    expect(busyNow).toBe(false);
    vi.mocked(service.load).mockRejectedValue(new Error('Falha de conexão.'));
    const { act } = await import('@testing-library/react');
    await act(async () => changed('Unidade Cozinha 2 criada.'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unidade Cozinha 2 criada. Não foi possível atualizar a lista: Falha de conexão.',
    );
  });
});

// P7 (fatia 6.8): uma empresa com dado inesperado não esconde as outras.
describe('acesso tolerante a empresa inválida', () => {
  it('mostra as válidas e avisa quantas não foram carregadas', async () => {
    const service = gateway();
    service.loadReport = vi.fn().mockResolvedValue({ access, skipped: 1 });
    render(<IdentityHome gateway={service} />);
    await login();
    expect(
      await screen.findByText('Unidade A — America/Sao_Paulo'),
    ).toBeVisible();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Não foi possível carregar 1 empresa.',
    );
  });
  it('sem nenhuma válida, diz que não carregou em vez de "sem vínculo"', async () => {
    const service = gateway();
    service.loadReport = vi.fn().mockResolvedValue({ access: [], skipped: 2 });
    render(<IdentityHome gateway={service} />);
    await login();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar sua empresa.',
    );
  });
});
