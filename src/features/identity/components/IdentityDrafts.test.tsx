import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IdentityHome } from './IdentityHome';
import type { IdentityGateway } from '../application/identityGateway';

const unitId = '30000000-0000-0000-0000-000000000001';
const userId = '10000000-0000-0000-0000-000000000001';
const service = (): IdentityGateway => ({
  signIn: vi.fn().mockResolvedValue(userId),
  signOut: vi.fn().mockResolvedValue(undefined),
  load: vi
    .fn()
    .mockResolvedValue([
      {
        id: '20000000-0000-0000-0000-000000000001',
        name: 'Empresa',
        establishments: [
          { id: unitId, name: 'Cozinha', timezone: 'America/Sao_Paulo' },
        ],
        memberships: [{ user_id: userId, role: 'owner' }],
      },
    ]),
  rename: vi.fn(),
  onSignOut: vi.fn().mockReturnValue(() => {}),
});
async function openDraft() {
  window.history.replaceState(null, '', '/');
  const api = service();
  render(
    <IdentityHome
      gateway={api}
      operationalShell
      renderCatalog={() => (
        <form aria-label="Recebimento">
          <label>
            Quantidade
            <input name="quantity" />
          </label>
        </form>
      )}
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('E-mail'), 'teste@example.invalid');
  await user.type(screen.getByLabelText('Senha'), 'senha');
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  await user.selectOptions(await screen.findByLabelText('Unidade'), unitId);
  return { user, api };
}
describe('rascunhos da unidade', () => {
  it('cancela atualização quando há rascunho e preserva os dados', async () => {
    const { user, api } = await openDraft();
    await user.type(screen.getByLabelText('Quantidade'), '10');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByText('Minha conta'));
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(confirm).toHaveBeenCalled();
    expect(api.load).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Quantidade')).toHaveValue('10');
    confirm.mockRestore();
  });
  it('permite atualizar sem pedir confirmação quando não houve edição', async () => {
    const { user, api } = await openDraft();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByText('Minha conta'));
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(api.load).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });
  it('pede aviso nativo na recarga enquanto o formulário está alterado', async () => {
    const { user } = await openDraft();
    await user.type(screen.getByLabelText('Quantidade'), '10');
    const event = new Event('beforeunload', { cancelable: true });
    expect(window.dispatchEvent(event)).toBe(false);
    await user.clear(screen.getByLabelText('Quantidade'));
    expect(
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ).toBe(true);
  });
  it('atualiza quando a pessoa aceita descartar o rascunho', async () => {
    const { user, api } = await openDraft();
    await user.type(screen.getByLabelText('Quantidade'), '10');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByText('Minha conta'));
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(api.load).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });
  it('não impede a saída da conta mesmo com rascunho', async () => {
    const { user, api } = await openDraft();
    await user.type(screen.getByLabelText('Quantidade'), '10');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(api.signOut).toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
