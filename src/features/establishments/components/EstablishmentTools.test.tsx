import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EstablishmentTools } from './EstablishmentTools';
import {
  EstablishmentRejected,
  EstablishmentUncertain,
} from '../application/establishmentGateway';
import type { EstablishmentGateway } from '../application/establishmentGateway';
import type { Access } from '../../identity/domain/identity';

const organization: Access[number] = {
  id: '20000000-0000-0000-0000-000000000001',
  name: 'Empresa A',
  establishments: [
    {
      id: '30000000-0000-0000-0000-000000000001',
      name: 'Unidade A',
      timezone: 'America/Sao_Paulo',
    },
  ],
  memberships: [
    { user_id: '10000000-0000-0000-0000-000000000001', role: 'owner' },
    { user_id: '10000000-0000-0000-0000-000000000002', role: 'member' },
    { user_id: '10000000-0000-0000-0000-000000000003', role: 'member' },
  ],
};
async function setup(owner = true, busy = false) {
  const gateway: EstablishmentGateway = {
    create: vi.fn().mockResolvedValue('nova'),
    rename: vi.fn().mockResolvedValue(undefined),
  };
  const onChanged = vi.fn().mockResolvedValue(undefined);
  render(
    <EstablishmentTools
      gateway={gateway}
      organization={organization}
      owner={owner}
      onChanged={onChanged}
      busy={busy}
    />,
  );
  const user = userEvent.setup();
  if (owner)
    await user.click(
      screen.getByRole('button', { name: 'Gerenciar unidades de Empresa A' }),
    );
  return { gateway, onChanged, user };
}
async function review(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Nome da nova unidade'), ' Cozinha 2 ');
  await user.selectOptions(
    screen.getByLabelText('Fuso horário da nova unidade'),
    'America/Manaus',
  );
  await user.click(
    screen.getByRole('button', { name: 'Revisar nova unidade' }),
  );
}

describe('gestão de unidades', () => {
  it.each(['create', 'rename'] as const)(
    'não avisa outra sessão quando %s termina após desmontagem',
    async (operation) => {
      let resolve!: (value: string) => void;
      const pending = new Promise<string>((done) => {
        resolve = done;
      });
      const gateway: EstablishmentGateway = {
        create: vi.fn().mockReturnValue(pending),
        rename: vi.fn().mockReturnValue(pending),
      };
      const onChanged = vi.fn().mockResolvedValue(undefined);
      const view = render(
        <EstablishmentTools
          gateway={gateway}
          organization={organization}
          owner
          onChanged={onChanged}
        />,
      );
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', { name: 'Gerenciar unidades de Empresa A' }),
      );
      if (operation === 'create') {
        await review(user);
        await user.click(
          screen.getByRole('button', { name: 'Confirmar criação' }),
        );
      } else {
        await user.click(
          screen.getByRole('button', { name: 'Renomear Unidade A' }),
        );
      }
      view.unmount();
      await act(async () => {
        resolve('id');
        await pending;
      });
      expect(onChanged).not.toHaveBeenCalled();
    },
  );
  it('colaborador não vê nenhum controle de unidade', async () => {
    await setup(false);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('mostra contagem de vínculos sem identificadores e fuso só leitura', async () => {
    await setup();
    expect(
      screen.getByRole('region', { name: 'Unidades de Empresa A' }),
    ).toBeVisible();
    expect(
      screen.getByText(/Vínculos ativos: 1 proprietário e 2 colaboradores\./),
    ).toBeVisible();
    expect(screen.queryByText(/10000000-/)).not.toBeInTheDocument();
    expect(screen.getByText(/Fuso: Brasília/)).toBeVisible();
    expect(
      screen.queryByRole('combobox', { name: /Fuso.*Unidade A/ }),
    ).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('cria somente após confirmar nome e fuso, com foco na confirmação', async () => {
    const { gateway, onChanged, user } = await setup();
    await review(user);
    expect(gateway.create).not.toHaveBeenCalled();
    const group = screen.getByRole('group', { name: 'Confirmar nova unidade' });
    expect(group).toHaveFocus();
    expect(group).toHaveTextContent('Cozinha 2');
    expect(group).toHaveTextContent('America/Manaus');
    expect(group).toHaveTextContent('não pode ser excluída');
    await user.click(screen.getByRole('button', { name: 'Confirmar criação' }));
    expect(gateway.create).toHaveBeenCalledWith(organization.id, {
      name: 'Cozinha 2',
      timezone: 'America/Manaus',
    });
    expect(onChanged).toHaveBeenCalledWith('Unidade Cozinha 2 criada.');
  });
  it('voltar mantém os dados digitados para correção', async () => {
    const { user } = await setup();
    await review(user);
    await user.click(screen.getByRole('button', { name: 'Voltar e corrigir' }));
    expect(screen.getByLabelText('Nome da nova unidade')).toHaveFocus();
    expect(screen.getByLabelText('Nome da nova unidade')).toHaveValue(
      ' Cozinha 2 ',
    );
    expect(screen.getByLabelText('Fuso horário da nova unidade')).toHaveValue(
      'America/Manaus',
    );
  });
  it('clique duplo gera uma única criação e desabilita durante o envio', async () => {
    const { gateway, user } = await setup();
    let finish!: (id: string) => void;
    vi.mocked(gateway.create).mockReturnValue(
      new Promise((done) => {
        finish = done;
      }),
    );
    await review(user);
    const button = screen.getByRole('button', { name: 'Confirmar criação' });
    await user.dblClick(button);
    expect(gateway.create).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    const { act } = await import('@testing-library/react');
    await act(async () => finish('nova'));
  });
  it('validação local mostra um único alerta e não chama o gateway', async () => {
    const { gateway, user } = await setup();
    await user.type(screen.getByLabelText('Nome da nova unidade'), '   ');
    await user.click(
      screen.getByRole('button', { name: 'Revisar nova unidade' }),
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Informe o nome da unidade',
    );
    await user.clear(screen.getByLabelText('Novo nome para Unidade A'));
    await user.type(screen.getByLabelText('Novo nome para Unidade A'), '  ');
    await user.click(
      screen.getByRole('button', { name: 'Renomear Unidade A' }),
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unidade A: Informe o nome da unidade',
    );
    expect(gateway.create).not.toHaveBeenCalled();
    expect(gateway.rename).not.toHaveBeenCalled();
  });
  it('recusa definitiva fica no formulário, sem atualizar o acesso', async () => {
    const { gateway, onChanged, user } = await setup();
    vi.mocked(gateway.create).mockRejectedValue(
      new EstablishmentRejected('Fuso horário inválido.'),
    );
    await review(user);
    await user.click(screen.getByRole('button', { name: 'Confirmar criação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Fuso horário inválido.',
    );
    expect(onChanged).not.toHaveBeenCalled();
    expect(
      screen.getByRole('group', { name: 'Confirmar nova unidade' }),
    ).toBeVisible();
  });
  it('resultado incerto atualiza a lista e pede conferência em vez de sucesso', async () => {
    const { gateway, onChanged, user } = await setup();
    vi.mocked(gateway.create).mockRejectedValue(
      new EstablishmentUncertain('Confira se ela já aparece.'),
    );
    await review(user);
    await user.click(screen.getByRole('button', { name: 'Confirmar criação' }));
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(
        'Confira se ela já aparece.',
        'error',
      ),
    );
    expect(onChanged).not.toHaveBeenCalledWith(
      expect.stringContaining('criada'),
    );
  });
  it('renomeia a unidade com o nome aparado e avisa', async () => {
    const { gateway, onChanged, user } = await setup();
    const input = screen.getByLabelText('Novo nome para Unidade A');
    await user.clear(input);
    await user.type(input, ' Cozinha central ');
    await user.click(
      screen.getByRole('button', { name: 'Renomear Unidade A' }),
    );
    expect(gateway.rename).toHaveBeenCalledWith(
      organization.id,
      organization.establishments[0]!.id,
      'Cozinha central',
    );
    expect(onChanged).toHaveBeenCalledWith('Nome da unidade atualizado.');
  });
  it('falha ao renomear aparece no formulário', async () => {
    const { gateway, onChanged, user } = await setup();
    vi.mocked(gateway.rename).mockRejectedValue(
      new EstablishmentRejected('Alteração recusada.'),
    );
    await user.click(
      screen.getByRole('button', { name: 'Renomear Unidade A' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Alteração recusada.',
    );
    expect(onChanged).not.toHaveBeenCalled();
  });
  it('começa recolhido e alterna com aria-expanded', async () => {
    render(
      <EstablishmentTools
        gateway={{ create: vi.fn(), rename: vi.fn() }}
        organization={organization}
        owner
        onChanged={vi.fn()}
      />,
    );
    const toggle = screen.getByRole('button', {
      name: 'Gerenciar unidades de Empresa A',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Nome da nova unidade')).toBeNull();
    await userEvent.setup().click(toggle);
    expect(
      screen.getByRole('button', { name: 'Fechar unidades de Empresa A' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });
  it('outra ação de acesso em andamento bloqueia gravações', async () => {
    const { gateway, user } = await setup(true, true);
    expect(
      screen.getByRole('button', { name: 'Revisar nova unidade' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Renomear Unidade A' }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'Renomear Unidade A' }),
    );
    expect(gateway.rename).not.toHaveBeenCalled();
  });
});
