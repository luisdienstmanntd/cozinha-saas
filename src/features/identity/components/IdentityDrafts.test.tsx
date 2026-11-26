import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IdentityHome } from './IdentityHome';
import type { IdentityGateway } from '../application/identityGateway';
import type { Access } from '../domain/identity';
import {
  markUnitDraftClean,
  markUnitDraftKeyClean,
} from '../application/unitDrafts';
import type { UnitContext } from './IdentityHome';

const userId = '10000000-0000-0000-0000-000000000001';
const unitId = '30000000-0000-0000-0000-000000000001';
const access: Access = [
  {
    id: '20000000-0000-0000-0000-000000000001',
    name: 'Empresa',
    establishments: [
      { id: unitId, name: 'Cozinha', timezone: 'America/Sao_Paulo' },
    ],
    memberships: [{ user_id: userId, role: 'owner' }],
  },
];
const secondUnitId = '30000000-0000-0000-0000-000000000002';
const twoUnits: Access = [
  {
    ...access[0]!,
    establishments: [
      ...access[0]!.establishments,
      { id: secondUnitId, name: 'Cozinha 2', timezone: 'America/Sao_Paulo' },
    ],
  },
];
const service = (units: Access = access): IdentityGateway => ({
  signIn: vi.fn().mockResolvedValue(userId),
  signOut: vi.fn().mockResolvedValue(undefined),
  load: vi.fn().mockResolvedValue(units),
  rename: vi.fn().mockResolvedValue(undefined),
  onSignOut: vi.fn().mockReturnValue(() => {}),
});

function RevisableDraft() {
  const [stage, setStage] = useState<'form' | 'review'>('form');
  const [value, setValue] = useState('');
  const savedScope = useRef<HTMLElement | null>(null);
  return stage === 'form' ? (
    <form aria-label="Rascunho de revisão" data-unit-draft-key="reviewable">
      <label>
        Observação{' '}
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button
        type="button"
        onClick={(event) => {
          savedScope.current =
            event.currentTarget.form?.closest('[data-unit-draft-scope]') ??
            null;
          setStage('review');
        }}
      >
        Revisar
      </button>
    </form>
  ) : (
    <section aria-label="Revisão">
      <p>{value}</p>
      <button
        type="button"
        onClick={() => {
          markUnitDraftKeyClean('reviewable', savedScope.current);
          setStage('form');
        }}
      >
        Salvar revisão
      </button>
      <button type="button" onClick={() => setStage('form')}>
        Voltar
      </button>
    </section>
  );
}

function DiscardableDraft() {
  const [open, setOpen] = useState(true);
  if (!open) return <p>Formulário fechado</p>;
  return (
    <form
      aria-label="Formulário que pode ser fechado"
      data-unit-draft-key="discardable"
    >
      <label>
        Observação <input name="note" />
      </label>
      <button
        type="button"
        data-draft-discard="discardable"
        onClick={() => setOpen(false)}
      >
        Fechar formulário
      </button>
    </form>
  );
}

async function openUnit(
  renderCatalog: (unit: UnitContext) => ReactNode,
  units: Access = access,
  renderOrganizationTools?: Parameters<
    typeof IdentityHome
  >[0]['renderOrganizationTools'],
) {
  window.history.replaceState(null, '', '/');
  const gateway = service(units);
  render(
    <IdentityHome
      gateway={gateway}
      operationalShell
      renderCatalog={(_org, _unit, _owner, _user, _timezone, context) =>
        renderCatalog(context)
      }
      renderOrganizationTools={renderOrganizationTools}
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('E-mail'), 'teste@example.invalid');
  await user.type(screen.getByLabelText('Senha'), 'senha');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  await user.selectOptions(await screen.findByLabelText('Unidade'), unitId);
  return { user, gateway };
}

describe('rascunhos da unidade', () => {
  it('detecta alteração sem foco e preserva o rascunho se a atualização for cancelada', async () => {
    const { user, gateway } = await openUnit(() => (
      <form aria-label="Recebimento">
        <label>
          Lote <input name="lot" />
        </label>
      </form>
    ));
    const input = screen.getByLabelText('Lote');
    fireEvent.input(input, { target: { value: 'LOTE-1' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByText('Minha conta'));
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(confirm).toHaveBeenCalled();
    expect(gateway.load).toHaveBeenCalledTimes(2);
    expect(input).toHaveValue('LOTE-1');
    confirm.mockRestore();
  });

  it('não avisa quando o campo volta ao valor inicial', async () => {
    const { user } = await openUnit(() => (
      <form aria-label="Recebimento">
        <label>
          Lote <input name="lot" />
        </label>
      </form>
    ));
    const input = screen.getByLabelText('Lote');
    fireEvent.input(input, { target: { value: 'LOTE-1' } });
    fireEvent.input(input, { target: { value: '' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByText('Minha conta'));
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('aplica a atualização confirmada e recria o formulário com os valores atuais', async () => {
    const { user, gateway } = await openUnit(() => (
      <form aria-label="Recebimento">
        <label>
          Lote <input name="lot" />
        </label>
      </form>
    ));
    fireEvent.input(screen.getByLabelText('Lote'), {
      target: { value: 'LOTE-1' },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByText('Minha conta'));
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(gateway.load).toHaveBeenCalledTimes(2);
    expect(await screen.findByLabelText('Lote')).toHaveValue('');
    confirm.mockRestore();
  });

  it('não trata o formulário salvo como outro rascunho no refresh do callback', async () => {
    let savedForm: HTMLFormElement | null = null;
    const { user, gateway } = await openUnit(
      (unit) => (
        <>
          {unit.organizationTools}
          <form
            aria-label="Renomear unidade"
            ref={(form) => {
              savedForm = form;
            }}
          >
            <label>
              Nome <input name="name" />
            </label>
          </form>
        </>
      ),
      access,
      (_organization, _owner, onChanged) => (
        <button
          type="button"
          onClick={() =>
            void onChanged('Nome da unidade atualizado.', 'notice', savedForm)
          }
        >
          Salvar unidade
        </button>
      ),
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.input(screen.getByLabelText('Nome'), {
      target: { value: 'Cozinha nova' },
    });
    await user.click(screen.getByRole('button', { name: 'Salvar unidade' }));
    expect(gateway.load).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
    expect(await screen.findByLabelText('Nome')).toHaveValue('');
    confirm.mockRestore();
  });

  it('preserva a revisão de outro formulário quando o usuário cancela a atualização após renomear', async () => {
    const { user, gateway } = await openUnit(
      (unit) => (
        <>
          {unit.organizationTools}
          <RevisableDraft />
        </>
      ),
      access,
      (_organization, _owner, onChanged) => (
        <button
          type="button"
          onClick={() => void onChanged('Nome da unidade atualizado.')}
        >
          Salvar unidade
        </button>
      ),
    );
    await user.type(screen.getByLabelText('Observação'), 'conferir lote');
    await user.click(screen.getByRole('button', { name: 'Revisar' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Salvar unidade' }));
    expect(gateway.load).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('region', { name: 'Revisão' })).toHaveTextContent(
      'conferir lote',
    );
    expect(
      await screen.findByText(
        /A lista não foi atualizada porque há alterações/,
      ),
    ).toBeVisible();
    confirm.mockRestore();
  });

  it('mantém o aviso depois que o formulário entra em etapa de revisão', async () => {
    const { user } = await openUnit(() => <RevisableDraft />);
    await user.type(screen.getByLabelText('Observação'), 'conferir lote');
    await user.click(screen.getByRole('button', { name: 'Revisar' }));
    expect(screen.queryByLabelText('Observação')).not.toBeInTheDocument();
    const event = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(event)).toBe(false);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByText('Minha conta'));
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('limpa o rastreamento quando o salvamento confirma uma etapa sem o formulário conectado', async () => {
    const { user } = await openUnit(() => <RevisableDraft />);
    await user.type(screen.getByLabelText('Observação'), 'conferir lote');
    await user.click(screen.getByRole('button', { name: 'Revisar' }));
    await user.click(screen.getByRole('button', { name: 'Salvar revisão' }));
    expect(
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ).toBe(true);
  });

  it('respeita reset cancelado e limpa após reset concluído', async () => {
    const { user } = await openUnit(() => (
      <form aria-label="Recebimento">
        <label>
          Lote <input name="lot" />
        </label>
      </form>
    ));
    const form = screen.getByRole('form', {
      name: 'Recebimento',
    }) as HTMLFormElement;
    const input = screen.getByLabelText('Lote');
    fireEvent.input(input, { target: { value: 'LOTE-1' } });
    const cancelReset = (event: Event) => event.preventDefault();
    form.addEventListener('reset', cancelReset);
    form.reset();
    expect(input).toHaveValue('LOTE-1');
    expect(
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ).toBe(false);
    form.removeEventListener('reset', cancelReset);
    form.reset();
    expect(input).toHaveValue('');
    expect(
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ).toBe(true);
    await user.click(screen.getByText('Minha conta'));
  });

  it('confirma antes de fechar um formulário alterado e limpa o rascunho ao aceitar', async () => {
    const { user } = await openUnit(() => <DiscardableDraft />);
    await user.type(screen.getByLabelText('Observação'), 'rascunho');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Fechar formulário' }));
    expect(screen.getByLabelText('Observação')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Fechar formulário' }));
    expect(screen.getByText('Formulário fechado')).toBeVisible();
    expect(
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ).toBe(true);
    confirm.mockRestore();
  });

  it('trocar de unidade preserva os formulários visitados sem pedir confirmação', async () => {
    const { user } = await openUnit(
      (unit) => (
        <form aria-label={`Recebimento ${unit.unitName}`}>
          <label>
            {`Lote ${unit.unitName}`} <input name="lot" />
          </label>
        </form>
      ),
      twoUnits,
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.type(screen.getByLabelText('Lote Cozinha'), 'LOTE-A');
    await user.selectOptions(screen.getByLabelText('Unidade'), secondUnitId);
    await user.selectOptions(screen.getByLabelText('Unidade'), unitId);
    expect(screen.getByLabelText('Lote Cozinha')).toHaveValue('LOTE-A');
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('remove imediatamente a unidade revogada e preserva rascunho autorizado se a confirmação for cancelada', async () => {
    const { user, gateway } = await openUnit(
      (unit) => (
        <form aria-label={`Recebimento ${unit.unitName}`}>
          <label>
            {`Lote ${unit.unitName}`} <input name="lot" />
          </label>
        </form>
      ),
      twoUnits,
    );
    vi.mocked(gateway.load).mockResolvedValueOnce(access);
    await user.type(screen.getByLabelText('Lote Cozinha'), 'LOTE-A');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByText('Minha conta'));
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Unidade')).not.toHaveTextContent('Cozinha 2');
    await user.selectOptions(screen.getByLabelText('Unidade'), unitId);
    expect(screen.getByLabelText('Lote Cozinha')).toHaveValue('LOTE-A');
    confirm.mockRestore();
  });

  it('limpa somente o formulário salvo, mantendo os outros rascunhos protegidos', async () => {
    const { user } = await openUnit(() => (
      <>
        <form aria-label="Cadastro A">
          <label>
            Nome A <input name="name" />
          </label>
        </form>
        <form aria-label="Cadastro B">
          <label>
            Nome B <input name="name" />
          </label>
        </form>
      </>
    ));
    const first = screen.getByRole('form', {
      name: 'Cadastro A',
    }) as HTMLFormElement;
    fireEvent.input(screen.getByLabelText('Nome A'), {
      target: { value: 'Salvo' },
    });
    fireEvent.input(screen.getByLabelText('Nome B'), {
      target: { value: 'Pendente' },
    });
    markUnitDraftClean(first);
    const pending = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(pending)).toBe(false);
    markUnitDraftClean(
      screen.getByRole('form', { name: 'Cadastro B' }) as HTMLFormElement,
    );
    expect(
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ).toBe(true);
    await user.click(screen.getByText('Minha conta'));
  });

  it('não bloqueia a saída voluntária da conta', async () => {
    const { user, gateway } = await openUnit(() => (
      <form aria-label="Recebimento">
        <label>
          Lote <input name="lot" />
        </label>
      </form>
    ));
    fireEvent.input(screen.getByLabelText('Lote'), {
      target: { value: 'LOTE-1' },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(gateway.signOut).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
