import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdentityHome } from './IdentityHome';
import type {
  IdentityGateway,
  SignOutReason,
} from '../application/identityGateway';
import { createActivityStore } from '../application/sessionActivity';
import type { Access } from '../domain/identity';
import { INACTIVITY_LIMIT_MS } from '../domain/session';

const userA = '10000000-0000-0000-0000-000000000001';
const userB = '10000000-0000-0000-0000-000000000002';
function accessFor(user: string, name: string): Access {
  return [
    {
      id: '20000000-0000-0000-0000-000000000001',
      name,
      establishments: [
        {
          id: '30000000-0000-0000-0000-000000000001',
          name: `Unidade de ${name}`,
          timezone: 'America/Sao_Paulo',
        },
      ],
      memberships: [{ user_id: user, role: 'owner' }],
    },
  ];
}
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}
function gateway(stored: { id: string; email: string } | null) {
  let signOutListener: (reason?: SignOutReason) => void = () => {};
  const service = {
    signIn: vi.fn().mockResolvedValue(userA),
    signOut: vi.fn().mockResolvedValue(undefined),
    expire: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(accessFor(userA, 'Empresa A')),
    rename: vi.fn().mockResolvedValue(undefined),
    currentUser: vi.fn().mockResolvedValue(stored),
    touch: vi.fn().mockResolvedValue('ok'),
    onSignOut: vi.fn((callback: (reason?: SignOutReason) => void) => {
      signOutListener = callback;
      return () => {};
    }),
  };
  return {
    service: service as unknown as IdentityGateway & typeof service,
    fire: (reason?: SignOutReason) => signOutListener(reason),
  };
}
const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);

describe('sessão persistente (V2, D-025)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('recarregar com sessão válida não pede login e mostra quem está conectado', async () => {
    const { service } = gateway({ id: userA, email: 'ana@example.invalid' });
    const store = createActivityStore(memoryStorage());
    store.write(NOW - 5 * 60 * 1000);
    render(<IdentityHome gateway={service} activity={store} />);
    expect(await screen.findByText('Empresa A')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeVisible();
    expect(screen.getByText('ana@example.invalid')).toBeVisible();
    expect(service.touch).toHaveBeenCalled();
    expect(service.signIn).not.toHaveBeenCalled();
  });

  it('recarregar depois de 30 minutos parados encerra a sessão e pede login', async () => {
    const { service } = gateway({ id: userA, email: 'ana@example.invalid' });
    const store = createActivityStore(memoryStorage());
    store.write(NOW - INACTIVITY_LIMIT_MS - 1000);
    render(<IdentityHome gateway={service} activity={store} />);
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sessão encerrada por inatividade',
    );
    expect(service.expire).toHaveBeenCalled();
    expect(service.load).not.toHaveBeenCalled();
    expect(screen.queryByText('Empresa A')).toBeNull();
  });

  it('sessão sem registro de atividade no navegador não é reaproveitada', async () => {
    const { service } = gateway({ id: userA, email: 'ana@example.invalid' });
    render(
      <IdentityHome
        gateway={service}
        activity={createActivityStore(memoryStorage())}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(service.load).not.toHaveBeenCalled();
  });

  it('servidor que recusa a sessão ao restaurar não mostra dados', async () => {
    const { service } = gateway({ id: userA, email: 'ana@example.invalid' });
    service.touch.mockResolvedValue('expired');
    const store = createActivityStore(memoryStorage());
    store.write(NOW);
    render(<IdentityHome gateway={service} activity={store} />);
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(service.load).not.toHaveBeenCalled();
    expect(service.expire).toHaveBeenCalled();
  });

  it('sem sessão guardada mostra o login', async () => {
    const { service } = gateway(null);
    render(
      <IdentityHome
        gateway={service}
        activity={createActivityStore(memoryStorage())}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('30 minutos sem toque encerram a sessão com a tela aberta', async () => {
    const { service } = gateway({ id: userA, email: 'ana@example.invalid' });
    const store = createActivityStore(memoryStorage());
    store.write(NOW);
    render(<IdentityHome gateway={service} activity={store} />);
    await screen.findByText('Empresa A');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INACTIVITY_LIMIT_MS - 60_000);
    });
    expect(screen.getByText('Empresa A')).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(screen.queryByText('Empresa A')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('inatividade');
    expect(service.expire).toHaveBeenCalledTimes(1);
  });

  it('atividade renova o prazo e avisa o servidor', async () => {
    const { service } = gateway({ id: userA, email: 'ana@example.invalid' });
    const store = createActivityStore(memoryStorage());
    store.write(NOW);
    render(<IdentityHome gateway={service} activity={store} />);
    await screen.findByText('Empresa A');
    const touches = service.touch.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60_000);
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(service.touch.mock.calls.length).toBeGreaterThan(touches);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60_000);
    });
    expect(screen.getByText('Empresa A')).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11 * 60_000);
    });
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  it('toque depois do prazo não reativa a sessão', async () => {
    const { service } = gateway({ id: userA, email: 'ana@example.invalid' });
    const store = createActivityStore(memoryStorage());
    store.write(NOW);
    render(<IdentityHome gateway={service} activity={store} />);
    await screen.findByText('Empresa A');
    // O aparelho dormiu: o relógio avança sem os temporizadores rodarem.
    vi.setSystemTime(NOW + INACTIVITY_LIMIT_MS + 5000);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Atualizar acesso' }));
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(screen.queryByText('Empresa A')).toBeNull();
  });

  it('recusa SESSION_EXPIRED do servidor com a tela aberta limpa os dados', async () => {
    const { service, fire } = gateway({
      id: userA,
      email: 'ana@example.invalid',
    });
    const store = createActivityStore(memoryStorage());
    store.write(NOW);
    render(<IdentityHome gateway={service} activity={store} />);
    await screen.findByText('Empresa A');
    await act(async () => fire('expired'));
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(screen.queryByText('Empresa A')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('inatividade');
  });

  it('Sair fica visível, encerra no servidor e apaga a atividade', async () => {
    const { service } = gateway({ id: userA, email: 'ana@example.invalid' });
    const storage = memoryStorage();
    const store = createActivityStore(storage);
    store.write(NOW);
    render(<IdentityHome gateway={service} activity={store} />);
    await screen.findByText('Empresa A');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeVisible();
    expect(service.signOut).toHaveBeenCalledTimes(1);
    expect(store.read()).toBeNull();
    expect(screen.queryByText('Empresa A')).toBeNull();
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });

  it('troca de usuário no mesmo aparelho não deixa dados da pessoa anterior', async () => {
    const { service } = gateway({ id: userA, email: 'ana@example.invalid' });
    const store = createActivityStore(memoryStorage());
    store.write(NOW);
    render(<IdentityHome gateway={service} activity={store} />);
    await screen.findByText('Empresa A');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    await screen.findByRole('button', { name: 'Entrar' });
    service.signIn.mockResolvedValue(userB);
    service.load.mockResolvedValue(accessFor(userB, 'Empresa B'));
    await user.type(screen.getByLabelText('E-mail'), 'bia@example.invalid');
    await user.type(screen.getByLabelText('Senha'), 'senha-de-teste');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Empresa B')).toBeVisible();
    expect(screen.queryByText('Empresa A')).toBeNull();
    expect(screen.getByText('bia@example.invalid')).toBeVisible();
    expect(screen.queryByText('ana@example.invalid')).toBeNull();
  });

  it('falha do servidor ao sair não mantém a tela aberta', async () => {
    const { service } = gateway({ id: userA, email: 'ana@example.invalid' });
    service.signOut.mockRejectedValue(new Error('Servidor não confirmou.'));
    const store = createActivityStore(memoryStorage());
    store.write(NOW);
    render(<IdentityHome gateway={service} activity={store} />);
    await screen.findByText('Empresa A');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Servidor não confirmou.',
      ),
    );
    expect(screen.queryByText('Empresa A')).toBeNull();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });
});
