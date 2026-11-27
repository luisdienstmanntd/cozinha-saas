import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AccountPanel } from './AccountPanel';
import type { AccountGateway } from '../application/accountGateway';

function fake(factors: { id: string; name: string | null }[] = []) {
  let current = factors;
  const gateway = {
    changePassword: vi.fn().mockResolvedValue(undefined),
    factors: vi.fn(async () => current),
    startEnroll: vi.fn().mockResolvedValue({
      factorId: 'novo',
      secret: 'JBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/CozziGo:ana?secret=JBSWY3DPEHPK3PXP',
    }),
    confirmEnroll: vi.fn(async () => {
      current = [{ id: 'novo', name: 'App autenticador' }];
    }),
    cancelEnroll: vi.fn().mockResolvedValue(undefined),
    removeFactor: vi.fn(async () => {
      current = [];
    }),
  };
  return gateway satisfies AccountGateway;
}

it('troca de senha: confere tamanho e confirmação antes de chamar o servidor', async () => {
  const gateway = fake();
  const user = userEvent.setup();
  render(<AccountPanel gateway={gateway} />);
  await screen.findByRole('button', { name: /Ativar verificação/ });
  await user.type(screen.getByLabelText('Nova senha'), 'curta');
  await user.type(screen.getByLabelText('Repita a nova senha'), 'curta');
  await user.click(screen.getByRole('button', { name: 'Trocar senha' }));
  expect(await screen.findByText(/pelo menos 8/)).toBeVisible();
  expect(gateway.changePassword).not.toHaveBeenCalled();

  await user.clear(screen.getByLabelText('Nova senha'));
  await user.clear(screen.getByLabelText('Repita a nova senha'));
  await user.type(screen.getByLabelText('Nova senha'), 'senha-longa-1');
  await user.type(
    screen.getByLabelText('Repita a nova senha'),
    'senha-longa-2',
  );
  await user.click(screen.getByRole('button', { name: 'Trocar senha' }));
  expect(await screen.findByText(/confirmação não é igual/)).toBeVisible();
  expect(gateway.changePassword).not.toHaveBeenCalled();

  await user.clear(screen.getByLabelText('Repita a nova senha'));
  await user.type(
    screen.getByLabelText('Repita a nova senha'),
    'senha-longa-1',
  );
  await user.click(screen.getByRole('button', { name: 'Trocar senha' }));
  expect(await screen.findByText(/Senha trocada/)).toBeVisible();
  expect(gateway.changePassword).toHaveBeenCalledWith('senha-longa-1');
  expect(screen.getByLabelText('Nova senha')).toHaveValue('');
});

it('ativar: mostra a chave, exige 6 dígitos e confirma o código', async () => {
  const gateway = fake();
  const user = userEvent.setup();
  render(<AccountPanel gateway={gateway} />);
  await user.click(
    await screen.findByRole('button', { name: /Ativar verificação/ }),
  );
  expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeVisible();
  expect(await screen.findByAltText(/QR para cadastrar/)).toBeVisible();

  await user.type(screen.getByLabelText('Código do aplicativo'), '12 34');
  await user.click(screen.getByRole('button', { name: 'Ativar' }));
  expect(
    await screen.findByText(/Informe o código de 6 dígitos/),
  ).toBeVisible();
  expect(gateway.confirmEnroll).not.toHaveBeenCalled();

  await user.clear(screen.getByLabelText('Código do aplicativo'));
  await user.type(screen.getByLabelText('Código do aplicativo'), '123 456');
  await user.click(screen.getByRole('button', { name: 'Ativar' }));
  expect(
    await screen.findByText(/Verificação em duas etapas ativada/),
  ).toBeVisible();
  expect(gateway.confirmEnroll).toHaveBeenCalledWith('novo', '123456');
  expect(await screen.findByText('Ativada.')).toBeVisible();
});

it('cancelar o cadastro descarta o fator pendente', async () => {
  const gateway = fake();
  const user = userEvent.setup();
  render(<AccountPanel gateway={gateway} />);
  await user.click(
    await screen.findByRole('button', { name: /Ativar verificação/ }),
  );
  await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
  expect(gateway.cancelEnroll).toHaveBeenCalledWith('novo');
  expect(screen.queryByText('JBSWY3DPEHPK3PXP')).toBeNull();
});

it('remover pede o código atual e volta ao estado sem segundo fator', async () => {
  const gateway = fake([{ id: 'f1', name: 'App autenticador' }]);
  const user = userEvent.setup();
  render(<AccountPanel gateway={gateway} />);
  await user.click(
    await screen.findByRole('button', {
      name: 'Remover verificação em duas etapas',
    }),
  );
  await user.click(screen.getByRole('button', { name: 'Remover verificação' }));
  expect(
    await screen.findByText(/Informe o código de 6 dígitos/),
  ).toBeVisible();
  expect(gateway.removeFactor).not.toHaveBeenCalled();
  await user.type(
    screen.getByLabelText('Código atual do aplicativo'),
    '654321',
  );
  await user.click(screen.getByRole('button', { name: 'Remover verificação' }));
  await waitFor(() =>
    expect(gateway.removeFactor).toHaveBeenCalledWith('f1', '654321'),
  );
  expect(await screen.findByText(/Ainda não ativada/)).toBeVisible();
});

it('erro do servidor aparece em português e a falha ao consultar permite tentar de novo', async () => {
  const gateway = fake();
  gateway.factors.mockRejectedValueOnce(
    new Error('Não foi possível consultar a conta.'),
  );
  const user = userEvent.setup();
  render(<AccountPanel gateway={gateway} />);
  expect(
    await screen.findByText(/Não foi possível consultar a conta/),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(
    await screen.findByRole('button', { name: /Ativar verificação/ }),
  ).toBeVisible();

  gateway.startEnroll.mockRejectedValueOnce(
    new Error('Não disponível neste ambiente.'),
  );
  await user.click(screen.getByRole('button', { name: /Ativar verificação/ }));
  expect(
    await screen.findByText('Não disponível neste ambiente.'),
  ).toBeVisible();
});
