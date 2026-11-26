import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { OperationsNav } from './OperationsNav';
import { workspaceAreas } from '../domain/workspaceAreas';
import type { AreaId } from '../domain/areas';

it('recolhe administração, abre o grupo do destino e permite fechá-lo manualmente', async () => {
  const user = userEvent.setup();
  const props = {
    areas: workspaceAreas(true, true, true),
    hrefFor: (id: AreaId) => `?area=${id}`,
    select: vi.fn(),
    unitName: 'Cozinha',
  };
  const { rerender } = render(
    <OperationsNav {...props} current="visao-geral" />,
  );
  expect(screen.getByRole('button', { name: 'Cadastros' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.getByRole('button', { name: 'Configurações' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(
    screen.queryByRole('link', { name: 'Produtos' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cadastros' }));
  await user.click(screen.getByRole('link', { name: 'Produtos' }));
  expect(props.select).toHaveBeenCalledWith('produtos');
  rerender(<OperationsNav {...props} current="config-unidade" />);
  expect(screen.getByRole('button', { name: 'Configurações' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await user.click(screen.getByRole('button', { name: 'Configurações' }));
  expect(screen.getByRole('button', { name: 'Configurações' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('abre Cadastros no acesso direto e não oferece cadastro ao colaborador', () => {
  const props = {
    hrefFor: (id: AreaId) => `?area=${id}`,
    select: vi.fn(),
    unitName: 'Cozinha',
  };
  const { rerender } = render(
    <OperationsNav
      {...props}
      areas={workspaceAreas(true, true, true)}
      current="preparacoes"
    />,
  );
  expect(
    screen.getByRole('link', { name: 'Preparações próprias' }),
  ).toHaveAttribute('aria-current', 'page');
  rerender(
    <OperationsNav
      {...props}
      areas={workspaceAreas(false, true, true)}
      current="producao"
    />,
  );
  expect(
    screen.queryByRole('button', { name: 'Cadastros' }),
  ).not.toBeInTheDocument();
});

it('Escape fecha o menu do celular também com o foco no botão Menu', async () => {
  const user = userEvent.setup();
  render(
    <OperationsNav
      areas={workspaceAreas(true, true, true)}
      current="visao-geral"
      hrefFor={(id: AreaId) => `?area=${id}`}
      select={vi.fn()}
      unitName="Cozinha"
    />,
  );
  const menu = screen.getByRole('button', { name: 'Menu' });
  await user.click(menu);
  expect(menu).toHaveAttribute('aria-expanded', 'true');
  menu.focus();
  await user.keyboard('{Escape}');
  expect(menu).toHaveAttribute('aria-expanded', 'false');
  expect(menu).toHaveFocus();
});
