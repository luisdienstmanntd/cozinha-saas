import {
  render,
  screen,
  within,
  waitFor,
  cleanup,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { SupplierActions } from './SupplierActions';
import type { CatalogGateway } from '../application/catalogGateway';
const supplier = {
  id: 's1',
  name: 'Horta',
  email: 'a@example.test',
  contact: '0011',
};
const scope = { organizationId: 'org', establishmentId: 'unit' };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});
function setup() {
  const gateway: CatalogGateway = {
    list: vi.fn(),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
    updateSupplier: vi
      .fn()
      .mockResolvedValue({ ...supplier, name: 'Nova Horta' }),
    deleteSupplier: vi.fn().mockResolvedValue(undefined),
  };
  const onUpdated = vi.fn(),
    onDeleted = vi.fn();
  render(
    <SupplierActions
      supplier={supplier}
      scope={scope}
      gateway={gateway}
      active
      onUpdated={onUpdated}
      onDeleted={onDeleted}
    />,
  );
  return { gateway, onUpdated, onDeleted, user: userEvent.setup() };
}
it('abre edição pelo ícone, preserva erro e só atualiza após salvar', async () => {
  const { gateway, onUpdated, user } = setup();
  vi.mocked(gateway.updateSupplier!).mockRejectedValueOnce(
    new Error('Nome já existe.'),
  );
  const trigger = screen.getByRole('button', {
    name: 'Editar fornecedor Horta',
  });
  await user.click(trigger);
  const dialog = within(
    screen.getByRole('dialog', { name: 'Editar fornecedor' }),
  );
  expect(dialog.getByLabelText('Nome do fornecedor')).toHaveValue('Horta');
  await user.clear(dialog.getByLabelText('Nome do fornecedor'));
  await user.type(dialog.getByLabelText('Nome do fornecedor'), 'Nova Horta');
  await user.click(dialog.getByRole('button', { name: 'Salvar alterações' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('Nome já existe.');
  expect(dialog.getByLabelText('Nome do fornecedor')).toHaveValue('Nova Horta');
  expect(onUpdated).not.toHaveBeenCalled();
  await user.click(dialog.getByRole('button', { name: 'Salvar alterações' }));
  expect(gateway.updateSupplier).toHaveBeenLastCalledWith(scope, 's1', {
    name: 'Nova Horta',
    email: 'a@example.test',
    contact: '0011',
  });
  expect(onUpdated).toHaveBeenCalledOnce();
  await waitFor(() => expect(trigger).toHaveFocus());
});
it('confirma o nome antes de excluir e cancelar não grava', async () => {
  const { gateway, onDeleted, user } = setup();
  const trigger = screen.getByRole('button', {
    name: 'Excluir fornecedor Horta',
  });
  await user.click(trigger);
  const dialog = within(
    screen.getByRole('dialog', { name: 'Excluir fornecedor Horta?' }),
  );
  expect(dialog.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  await user.click(dialog.getByRole('button', { name: 'Cancelar' }));
  expect(gateway.deleteSupplier).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  await user.click(
    within(
      screen.getByRole('dialog', { name: 'Excluir fornecedor Horta?' }),
    ).getByRole('button', { name: 'Excluir fornecedor' }),
  );
  expect(gateway.deleteSupplier).toHaveBeenCalledWith(scope, 's1');
  expect(onDeleted).toHaveBeenCalledOnce();
});
it('não remove o item quando o banco recusa fornecedor com recebimentos', async () => {
  const { gateway, onDeleted, user } = setup();
  vi.mocked(gateway.deleteSupplier!).mockRejectedValue(
    new Error('Este fornecedor possui recebimentos e não pode ser excluído.'),
  );
  await user.click(
    screen.getByRole('button', { name: 'Excluir fornecedor Horta' }),
  );
  const dialog = within(
    screen.getByRole('dialog', { name: 'Excluir fornecedor Horta?' }),
  );
  await user.click(dialog.getByRole('button', { name: 'Excluir fornecedor' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent(
    'possui recebimentos',
  );
  expect(onDeleted).not.toHaveBeenCalled();
});
