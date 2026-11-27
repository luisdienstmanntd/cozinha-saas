import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi, type Mock } from 'vitest';
import { OperationsNav } from './OperationsNav';
import { workspaceAreas } from '../domain/workspaceAreas';
import type { AreaId } from '../domain/areas';
import {
  COMPACT_QUERY,
  TABLET_QUERY,
} from '../../../shared/ui/useCompactLayout';

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

// PR-12 (D-078): no celular (≤ 899 px) o menu vira barra inferior com "Mais".
function compact() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === COMPACT_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function renderBar(
  options: {
    owner?: boolean;
    current?: AreaId;
    select?: Mock<(id: AreaId) => void>;
  } = {},
) {
  compact();
  const select = options.select ?? vi.fn<(id: AreaId) => void>();
  render(
    <>
      <button>Fora</button>
      <OperationsNav
        areas={workspaceAreas(options.owner ?? true, true, true)}
        current={options.current ?? 'visao-geral'}
        hrefFor={(id: AreaId) => `?area=${id}`}
        select={select}
        unitName="Cozinha"
      />
    </>,
  );
  return select;
}

it('PR-12: celular mostra a barra com 4 atalhos e Mais, sem o botão Menu nem o menu lateral', () => {
  renderBar();
  expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
  const bar = screen.getByRole('navigation', { name: 'Áreas da unidade' });
  expect(
    within(bar)
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label')),
  ).toEqual(['Visão geral', 'Validades', 'Produção', 'Etiquetas']);
  expect(
    within(bar).getByRole('link', { name: 'Visão geral' }),
  ).toHaveAttribute('aria-current', 'page');
  expect(within(bar).getByRole('button', { name: 'Mais' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('PR-12: um toque em um atalho troca de área; Ctrl+clique segue como link comum', async () => {
  const user = userEvent.setup();
  const select = renderBar();
  await user.click(screen.getByRole('link', { name: 'Etiquetas' }));
  expect(select).toHaveBeenCalledWith('etiquetas');
  select.mockClear();
  await user.keyboard('{Control>}');
  const link = screen.getByRole('link', { name: 'Validades' });
  link.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }),
  );
  await user.keyboard('{/Control}');
  expect(select).not.toHaveBeenCalled();
});

it('PR-12: Mais abre a folha com as demais áreas por perfil, foco dentro, e Escape devolve o foco', async () => {
  const user = userEvent.setup();
  renderBar();
  const more = screen.getByRole('button', { name: 'Mais' });
  await user.click(more);
  expect(more).toHaveAttribute('aria-expanded', 'true');
  const sheet = screen.getByRole('dialog', { name: 'Mais áreas' });
  expect(sheet).toHaveAttribute('aria-modal', 'true');
  expect(
    within(sheet)
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label')),
  ).toEqual([
    'Indicadores',
    'Recebimentos',
    'Locais de armazenamento',
    'Produtos',
    'Fornecedores',
    'Preparações próprias',
    'Unidade',
    'Organização',
    'Senha e acesso',
  ]);
  expect(sheet).toContainElement(document.activeElement as HTMLElement);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(more).toHaveFocus();
  expect(more).toHaveAttribute('aria-expanded', 'false');
});

it('PR-12: o foco fica preso na folha (Tab e Shift+Tab dão a volta)', async () => {
  const user = userEvent.setup();
  renderBar();
  await user.click(screen.getByRole('button', { name: 'Mais' }));
  const sheet = screen.getByRole('dialog', { name: 'Mais áreas' });
  const close = within(sheet).getByRole('button', { name: 'Fechar' });
  const stops = [...sheet.querySelectorAll<HTMLElement>('a[href], button')];
  expect(stops[0]).toHaveFocus();
  await user.tab({ shift: true });
  expect(stops[stops.length - 1]).toHaveFocus();
  await user.tab();
  expect(stops[0]).toHaveFocus();
  expect(close).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Fora' })).not.toHaveFocus();
});

it('PR-12: escolher uma área na folha fecha a folha e troca de área; Fechar devolve o foco ao Mais', async () => {
  const user = userEvent.setup();
  const select = renderBar();
  const more = screen.getByRole('button', { name: 'Mais' });
  await user.click(more);
  await user.click(screen.getByRole('link', { name: 'Produtos' }));
  expect(select).toHaveBeenCalledWith('produtos');
  expect(screen.queryByRole('dialog')).toBeNull();
  await user.click(more);
  await user.click(screen.getByRole('button', { name: 'Fechar' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(more).toHaveFocus();
});

it('PR-12: dentro de Mais, o botão fica marcado como atual; colaborador só tem as suas áreas', async () => {
  const user = userEvent.setup();
  renderBar({ owner: false, current: 'config-unidade' });
  const more = screen.getByRole('button', { name: 'Mais' });
  expect(more).toHaveClass('is-current');
  await user.click(more);
  const sheet = screen.getByRole('dialog', { name: 'Mais áreas' });
  expect(
    within(sheet)
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label')),
  ).toEqual(['Locais de armazenamento', 'Unidade', 'Senha e acesso']);
  expect(within(sheet).getByRole('link', { name: 'Unidade' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(
    screen.queryByRole('link', { name: 'Recebimentos' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Produtos' }),
  ).not.toBeInTheDocument();
});

// PR-13: tablet deitado (900 a 1199 px): menu recolhido por padrão, escolha lembrada por pessoa.
function widths(matching: string | null) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === matching,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderMenu(personKey?: string) {
  return render(
    <OperationsNav
      areas={workspaceAreas(true, true, true)}
      current="visao-geral"
      hrefFor={(id: AreaId) => `?area=${id}`}
      select={vi.fn()}
      unitName="Cozinha"
      personKey={personKey}
    />,
  );
}
const sidebar = (container: HTMLElement) =>
  container.querySelector('.mesa-sidebar')!;

it('PR-13: no tablet deitado o menu começa recolhido, com os links por ícone e nome acessível', () => {
  widths(TABLET_QUERY);
  const { container } = renderMenu('pessoa-a');
  expect(sidebar(container)).toHaveClass('is-compact');
  expect(
    screen.getByRole('button', { name: 'Expandir menu' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Validades' })).toHaveAttribute(
    'title',
    'Validades',
  );
});

it('PR-13: no notebook (1200 px ou mais) o menu continua expandido por padrão', () => {
  widths(null);
  const { container } = renderMenu('pessoa-a');
  expect(sidebar(container)).not.toHaveClass('is-compact');
  expect(
    screen.getByRole('button', { name: 'Recolher menu' }),
  ).toBeInTheDocument();
});

it('PR-13: expandir no tablet vale e é lembrado por pessoa neste aparelho', async () => {
  widths(TABLET_QUERY);
  const user = userEvent.setup();
  const first = renderMenu('pessoa-a');
  await user.click(screen.getByRole('button', { name: 'Expandir menu' }));
  expect(sidebar(first.container)).not.toHaveClass('is-compact');
  first.unmount();
  // A mesma pessoa reabre expandido; outra pessoa, ou ninguém, recebe o padrão do tablet.
  const again = renderMenu('pessoa-a');
  expect(sidebar(again.container)).not.toHaveClass('is-compact');
  again.unmount();
  const other = renderMenu('pessoa-b');
  expect(sidebar(other.container)).toHaveClass('is-compact');
  other.unmount();
  const anonymous = renderMenu();
  expect(sidebar(anonymous.container)).toHaveClass('is-compact');
});

it('PR-13: recolher no notebook também é lembrado', async () => {
  widths(null);
  const user = userEvent.setup();
  const first = renderMenu('pessoa-a');
  await user.click(screen.getByRole('button', { name: 'Recolher menu' }));
  expect(sidebar(first.container)).toHaveClass('is-compact');
  first.unmount();
  expect(sidebar(renderMenu('pessoa-a').container)).toHaveClass('is-compact');
});

it('PR-13: sem armazenamento (bloqueado ou ilegível) o menu funciona igual', async () => {
  widths(TABLET_QUERY);
  const user = userEvent.setup();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('bloqueado');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('bloqueado');
  });
  const { container } = renderMenu('pessoa-a');
  expect(sidebar(container)).toHaveClass('is-compact');
  await user.click(screen.getByRole('button', { name: 'Expandir menu' }));
  expect(sidebar(container)).not.toHaveClass('is-compact');
  vi.restoreAllMocks();
  window.localStorage.setItem('cozzigo.menu-recolhido.pessoa-a', 'lixo');
  expect(sidebar(renderMenu('pessoa-a').container)).toHaveClass('is-compact');
});
