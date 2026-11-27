import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { IdentityHome } from './IdentityHome';
import type { IdentityGateway } from '../application/identityGateway';
import { createActivityStore } from '../application/sessionActivity';

const user = '10000000-0000-0000-0000-000000000001';
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}
function gateway(mfa: boolean) {
  return {
    signIn: vi.fn().mockResolvedValue(user),
    signOut: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue([
      {
        id: '20000000-0000-0000-0000-000000000001',
        name: 'Empresa A',
        establishments: [],
        memberships: [{ user_id: user, role: 'owner' }],
      },
    ]),
    rename: vi.fn(),
    onSignOut: vi.fn(() => () => {}),
    mfaRequired: vi.fn().mockResolvedValue(mfa),
    verifyMfa: vi.fn().mockResolvedValue(undefined),
  } as unknown as IdentityGateway & {
    signIn: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    verifyMfa: ReturnType<typeof vi.fn>;
  };
}
async function enter(service: IdentityGateway) {
  const person = userEvent.setup();
  render(
    <IdentityHome
      gateway={service}
      activity={createActivityStore(memoryStorage())}
    />,
  );
  await person.type(screen.getByLabelText(/E-mail/), 'ana@example.invalid');
  await person.type(screen.getByLabelText(/Senha/), 'senha-correta');
  await person.click(screen.getByRole('button', { name: 'Entrar' }));
  return person;
}

it('com segundo fator, a senha sozinha não abre a conta: pede o código e só então carrega o acesso', async () => {
  const service = gateway(true);
  const person = await enter(service);
  expect(await screen.findByText('Verificação em duas etapas')).toBeVisible();
  expect(service.load).not.toHaveBeenCalled();
  expect(screen.queryByText('Empresa A')).toBeNull();

  await person.type(screen.getByLabelText(/Código do aplicativo/), '12');
  await person.click(screen.getByRole('button', { name: 'Confirmar' }));
  expect(
    await screen.findByText(/Informe o código de 6 dígitos/),
  ).toBeVisible();
  expect(service.verifyMfa).not.toHaveBeenCalled();
  expect(service.load).not.toHaveBeenCalled();

  await person.clear(screen.getByLabelText(/Código do aplicativo/));
  await person.type(screen.getByLabelText(/Código do aplicativo/), '123 456');
  await person.click(screen.getByRole('button', { name: 'Confirmar' }));
  expect(await screen.findByText('Empresa A')).toBeVisible();
  expect(service.verifyMfa).toHaveBeenCalledWith('123456');
});

it('código recusado mantém a pessoa fora; cancelar encerra a sessão só com senha', async () => {
  const service = gateway(true);
  service.verifyMfa.mockRejectedValueOnce(
    new Error('Código incorreto ou vencido.'),
  );
  const person = await enter(service);
  await person.type(
    await screen.findByLabelText(/Código do aplicativo/),
    '000000',
  );
  await person.click(screen.getByRole('button', { name: 'Confirmar' }));
  expect(await screen.findByText('Código incorreto ou vencido.')).toBeVisible();
  expect(service.load).not.toHaveBeenCalled();

  await person.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(service.signOut).toHaveBeenCalled();
  expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
});

it('sem segundo fator, a entrada segue como sempre', async () => {
  const service = gateway(false);
  await enter(service);
  expect(await screen.findByText('Empresa A')).toBeVisible();
  await waitFor(() => expect(service.verifyMfa).not.toHaveBeenCalled());
  expect(screen.queryByText('Verificação em duas etapas')).toBeNull();
});
