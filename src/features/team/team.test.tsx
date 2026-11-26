import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TeamPanel } from './components/TeamPanel';
import { TeamRejected, type TeamGateway } from './application/teamGateway';
import { createTeamGateway } from './data/supabaseTeam';
import {
  ACCESS_DENIED,
  GENERIC_FAILURE,
  splitTeam,
  teamErrorMessage,
  teamMemberSchema,
  type TeamMember,
} from './domain/team';

const ORG = '11111111-1111-4111-8111-111111111111';
const ANA = 'a1111111-1111-4111-8111-111111111111';
const BIA = 'b2222222-2222-4222-8222-222222222222';
const DAVI = 'd4444444-4444-4444-8444-444444444444';

const ana: TeamMember = {
  user_id: ANA,
  display_name: 'Ana',
  email: 'ana@example.invalid',
  role: 'owner',
  created_at: '2026-11-01T12:00:00Z',
  revoked_at: null,
  is_self: true,
};
const bia: TeamMember = {
  ...ana,
  user_id: BIA,
  display_name: 'Bia',
  email: 'bia@example.invalid',
  role: 'member',
  is_self: false,
};
const davi: TeamMember = {
  ...ana,
  user_id: DAVI,
  display_name: 'Davi',
  email: 'davi@example.invalid',
  role: 'member',
  is_self: false,
  revoked_at: '2026-11-20T12:00:00Z',
};

function fakeGateway(initial: TeamMember[]) {
  let rows = [...initial];
  const gateway = {
    list: vi.fn(async () => rows),
    add: vi.fn(async (_org: string, input: { displayName: string }) => {
      rows = [
        ...rows,
        {
          ...bia,
          user_id: 'c3333333-3333-4333-8333-333333333333',
          display_name: input.displayName,
          email: 'nova@example.invalid',
        },
      ];
      return 'c3333333-3333-4333-8333-333333333333';
    }),
    setRole: vi.fn(async (_org: string, id: string, role) => {
      rows = rows.map((m) => (m.user_id === id ? { ...m, role } : m));
      return role;
    }),
    rename: vi.fn(async (_org: string, id: string, name: string) => {
      rows = rows.map((m) =>
        m.user_id === id ? { ...m, display_name: name } : m,
      );
      return name;
    }),
    revoke: vi.fn(async (_org: string, id: string) => {
      rows = rows.map((m) =>
        m.user_id === id ? { ...m, revoked_at: '2026-11-26T01:00:00Z' } : m,
      );
    }),
    restore: vi.fn(async (_org: string, id: string) => {
      rows = rows.map((m) =>
        m.user_id === id ? { ...m, revoked_at: null, role: 'member' } : m,
      );
    }),
  } satisfies TeamGateway;
  return gateway;
}

function renderPanel(gateway: TeamGateway) {
  return render(
    <div className="workspace">
      <TeamPanel
        organizationId={ORG}
        organizationName="Cozinha Exemplo"
        timezone="America/Sao_Paulo"
        gateway={gateway}
      />
    </div>,
  );
}

const person = (name: string) =>
  within(screen.getByRole('region', { name: 'Pessoas com acesso' })).getByRole(
    'listitem',
    { name },
  );

describe('domínio da equipe', () => {
  it('lê a lista do banco e separa ativos de revogados', () => {
    const parsed = teamMemberSchema.array().parse([ana, davi]);
    expect(splitTeam(parsed).active).toEqual([ana]);
    expect(splitTeam(parsed).revoked).toEqual([davi]);
    expect(() => teamMemberSchema.parse({ ...ana, role: 'gestor' })).toThrow();
  });

  it('mostra só mensagens conhecidas do banco; o resto vira texto genérico', () => {
    expect(
      teamErrorMessage({
        code: '23514',
        message: 'A empresa precisa de pelo menos um proprietário ativo.',
      }),
    ).toBe('A empresa precisa de pelo menos um proprietário ativo.');
    expect(teamErrorMessage({ code: '42501', message: 'Acesso negado.' })).toBe(
      ACCESS_DENIED,
    );
    expect(
      teamErrorMessage({
        code: 'XX000',
        message: 'relation "x" does not exist',
      }),
    ).toBe(GENERIC_FAILURE);
  });
});

describe('gateway Supabase da equipe', () => {
  it('chama as funções do banco com os parâmetros esperados e normaliza o e-mail', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === 'list_team_members'
          ? [ana]
          : name === 'add_team_member'
            ? BIA
            : name === 'set_team_member_role'
              ? 'owner'
              : null,
      error: null,
    }));
    const gateway = createTeamGateway({ rpc } as unknown as SupabaseClient);
    expect(await gateway.list(ORG)).toEqual([ana]);
    await gateway.add(ORG, {
      email: '  Bia@Example.invalid ',
      displayName: ' Bia ',
      role: 'member',
    });
    expect(rpc).toHaveBeenCalledWith('add_team_member', {
      p_organization_id: ORG,
      p_email: 'bia@example.invalid',
      p_display_name: 'Bia',
      p_role: 'member',
    });
    expect(await gateway.setRole(ORG, BIA, 'owner')).toBe('owner');
    await gateway.revoke(ORG, BIA);
    expect(rpc).toHaveBeenCalledWith('revoke_team_member', {
      p_organization_id: ORG,
      p_user_id: BIA,
    });
    await gateway.restore(ORG, BIA);
    expect(rpc).toHaveBeenCalledWith('restore_team_member', {
      p_organization_id: ORG,
      p_user_id: BIA,
    });
  });

  it('transforma a recusa do banco em mensagem para a tela, sem detalhes internos', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: 'P0002',
        message:
          'Não foi possível vincular este e-mail. Confira se a conta foi criada e confirmada e se ela não está em uso em outra empresa.',
      },
    }));
    const gateway = createTeamGateway({ rpc } as unknown as SupabaseClient);
    await expect(
      gateway.add(ORG, {
        email: 'x@example.invalid',
        displayName: 'X',
        role: 'member',
      }),
    ).rejects.toBeInstanceOf(TeamRejected);
    const failing = createTeamGateway({
      rpc: async () => ({ data: null, error: { code: '42501' } }),
    } as unknown as SupabaseClient);
    await expect(failing.list(ORG)).rejects.toThrow(
      'Não foi possível carregar a equipe.',
    );
  });
});

describe('tela Equipe', () => {
  it('lista quem tem acesso com papel e e-mail, e marca a própria conta sem ações de risco', async () => {
    renderPanel(fakeGateway([ana, bia, davi]));
    expect(
      await screen.findByRole('heading', { name: 'Equipe', level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Com acesso (2)')).toBeInTheDocument();
    const self = person('Ana');
    expect(within(self).getByText('Você')).toBeInTheDocument();
    expect(within(self).getByText('Proprietário')).toBeInTheDocument();
    expect(within(self).getByText(/ana@example\.invalid/)).toBeInTheDocument();
    expect(
      within(self).queryByRole('button', { name: /Revogar/ }),
    ).not.toBeInTheDocument();
    expect(
      within(self).queryByRole('button', { name: /Tornar/ }),
    ).not.toBeInTheDocument();
    expect(
      within(person('Bia')).getByRole('button', {
        name: 'Revogar acesso de Bia',
      }),
    ).toBeEnabled();
    expect(screen.getByText('Acesso revogado (1)')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/teste|demo|supabase/i);
  });

  it('revoga só depois de confirmar e atualiza a lista', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway([ana, bia]);
    renderPanel(gateway);
    await user.click(
      await screen.findByRole('button', { name: 'Revogar acesso de Bia' }),
    );
    expect(gateway.revoke).not.toHaveBeenCalled();
    const confirm = screen.getByRole('group', {
      name: 'Confirmar revogação de Bia',
    });
    expect(confirm).toHaveTextContent('perde o acesso na hora');
    await user.click(
      within(confirm).getByRole('button', { name: 'Confirmar revogação' }),
    );
    expect(gateway.revoke).toHaveBeenCalledWith(ORG, BIA);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'O acesso de Bia foi revogado.',
    );
    expect(await screen.findByText('Acesso revogado (1)')).toBeInTheDocument();
    expect(screen.getByText('Com acesso (1)')).toBeInTheDocument();
  });

  it('cancelar a confirmação não chama o banco', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway([ana, bia]);
    renderPanel(gateway);
    await user.click(
      await screen.findByRole('button', { name: 'Tornar Bia proprietário' }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(gateway.setRole).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('group', { name: /Confirmar/ }),
    ).not.toBeInTheDocument();
  });

  it('troca o papel com confirmação', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway([ana, bia]);
    renderPanel(gateway);
    await user.click(
      await screen.findByRole('button', { name: 'Tornar Bia proprietário' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirmar: tornar proprietário' }),
    );
    expect(gateway.setRole).toHaveBeenCalledWith(ORG, BIA, 'owner');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Papel de Bia alterado para Proprietário.',
    );
    await waitFor(() =>
      expect(within(person('Bia')).getByText('Proprietário')).toBeVisible(),
    );
  });

  it('o único proprietário não pode ser rebaixado nem revogado pela tela', async () => {
    const other = { ...ana, user_id: BIA, display_name: 'Bia', is_self: false };
    // Situação vinda do banco: o único proprietário ativo é outra pessoa (a própria conta virou colaboradora).
    renderPanel(
      fakeGateway([
        { ...ana, role: 'member' },
        { ...other, role: 'owner' },
      ]),
    );
    expect(
      await screen.findByRole('button', { name: 'Revogar acesso de Bia' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Tornar Bia colaborador' }),
    ).toBeDisabled();
  });

  it('adiciona pessoa por e-mail com nome e papel', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway([ana]);
    renderPanel(gateway);
    await user.click(
      await screen.findByRole('button', { name: 'Adicionar pessoa' }),
    );
    const form = screen.getByRole('form', { name: 'Adicionar pessoa' });
    const submit = within(form).getByRole('button', {
      name: 'Adicionar à equipe',
    });
    expect(submit).toBeDisabled();
    await user.type(
      within(form).getByLabelText('E-mail da conta'),
      'nova@example.invalid',
    );
    await user.type(within(form).getByLabelText(/Nome de exibição/), 'Nina');
    expect(within(form).getByLabelText(/Colaborador/)).toBeChecked();
    await user.click(submit);
    expect(gateway.add).toHaveBeenCalledWith(ORG, {
      email: 'nova@example.invalid',
      displayName: 'Nina',
      role: 'member',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nina entrou na equipe com o papel Colaborador.',
    );
    expect(await screen.findByRole('listitem', { name: 'Nina' })).toBeVisible();
    expect(
      screen.queryByRole('form', { name: 'Adicionar pessoa' }),
    ).not.toBeInTheDocument();
  });

  it('mostra a recusa do banco e mantém o formulário preenchido', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway([ana]);
    gateway.add.mockRejectedValueOnce(
      new TeamRejected('Esta pessoa já faz parte da equipe.'),
    );
    renderPanel(gateway);
    await user.click(
      await screen.findByRole('button', { name: 'Adicionar pessoa' }),
    );
    const form = screen.getByRole('form', { name: 'Adicionar pessoa' });
    await user.type(
      within(form).getByLabelText('E-mail da conta'),
      'ana@example.invalid',
    );
    await user.type(within(form).getByLabelText(/Nome de exibição/), 'Ana');
    await user.click(
      within(form).getByRole('button', { name: 'Adicionar à equipe' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta pessoa já faz parte da equipe.',
    );
    expect(within(form).getByLabelText('E-mail da conta')).toHaveValue(
      'ana@example.invalid',
    );
  });

  it('erro inesperado não mostra detalhes internos', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway([ana, bia]);
    gateway.revoke.mockRejectedValueOnce(new Error('relation does not exist'));
    renderPanel(gateway);
    await user.click(
      await screen.findByRole('button', { name: 'Revogar acesso de Bia' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirmar revogação' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_FAILURE);
    expect(document.body.textContent).not.toMatch(/relation/);
  });

  it('edita o nome de exibição', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway([ana, bia]);
    renderPanel(gateway);
    await user.click(
      await screen.findByRole('button', { name: 'Editar nome de Bia' }),
    );
    const input = screen.getByLabelText('Novo nome de exibição');
    await user.clear(input);
    await user.type(input, 'Beatriz');
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(gateway.rename).toHaveBeenCalledWith(ORG, BIA, 'Beatriz');
    expect(
      await screen.findByRole('listitem', { name: 'Beatriz' }),
    ).toBeVisible();
  });

  it('restaura o acesso de quem foi revogado, como colaborador', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway([ana, davi]);
    renderPanel(gateway);
    await user.click(await screen.findByText('Acesso revogado (1)'));
    await user.click(
      screen.getByRole('button', { name: 'Restaurar acesso de Davi' }),
    );
    expect(gateway.restore).toHaveBeenCalledWith(ORG, DAVI);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'O acesso de Davi foi restaurado como colaborador.',
    );
    expect(await screen.findByText('Com acesso (2)')).toBeInTheDocument();
    expect(screen.queryByText(/Acesso revogado/)).not.toBeInTheDocument();
  });

  it('falha ao carregar oferece tentar de novo', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway([ana]);
    gateway.list.mockRejectedValueOnce(new Error('offline'));
    renderPanel(gateway);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar a equipe.',
    );
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Com acesso (1)')).toBeInTheDocument();
  });
});
