import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionLink } from './ActionLink';
import { PageHeader } from './PageHeader';
import { StatePanel } from './StatePanel';
import { StatTile } from './StatTile';
import { StatusBadge, type BadgeStatus } from './StatusBadge';

// PR-03 do roadmap de interface: componentes base ainda sem uso nas áreas.
describe('ActionLink', () => {
  it('clique simples navega dentro do app e cancela o padrão', async () => {
    const onNavigate = vi.fn();
    render(
      <ActionLink href="/?area=validade" onNavigate={onNavigate}>
        Ver validades
      </ActionLink>,
    );
    const link = screen.getByRole('link', { name: 'Ver validades' });
    expect(link).toHaveAttribute('href', '/?area=validade');
    expect(fireEvent.click(link)).toBe(false);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
    ['botão do meio', { button: 1 }],
  ])('%s não intercepta (o navegador abre em nova aba)', (_name, init) => {
    const onNavigate = vi.fn();
    render(
      <ActionLink href="/?area=validade" onNavigate={onNavigate}>
        Ver validades
      </ActionLink>,
    );
    expect(
      fireEvent.click(
        screen.getByRole('link', { name: 'Ver validades' }),
        init,
      ),
    ).toBe(true);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('StatusBadge', () => {
  it.each<[BadgeStatus, string]>([
    ['overdue', 'VENCIDO - somente descarte'],
    ['today', 'Vence hoje'],
    ['tomorrow', 'Vence amanhã'],
    ['upcoming', 'Vence em 5 dias'],
    ['depleted', 'Esgotado'],
    ['blocked', 'Bloqueado'],
  ])('%s mostra o texto e esconde o símbolo dos leitores', (status, text) => {
    const { container } = render(
      <StatusBadge status={status}>{text}</StatusBadge>,
    );
    expect(screen.getByText(text, { exact: false })).toBeVisible();
    expect(container.firstElementChild).toHaveTextContent(text);
    expect(
      container.querySelector('[aria-hidden="true"]')?.textContent,
    ).toMatch(/\S/);
    expect(container.firstElementChild).toHaveClass(`ui-badge-${status}`);
  });

  it('"vence hoje" e "vence amanhã" têm símbolos e classes diferentes', () => {
    const { container } = render(
      <>
        <StatusBadge status="today">Vence hoje</StatusBadge>
        <StatusBadge status="tomorrow">Vence amanhã</StatusBadge>
      </>,
    );
    const [today, tomorrow] = [...container.children];
    expect(today!.className).not.toBe(tomorrow!.className);
    expect(today!.querySelector('[aria-hidden]')!.textContent).not.toBe(
      tomorrow!.querySelector('[aria-hidden]')!.textContent,
    );
  });
});

describe('StatTile', () => {
  it('mostra rótulo, número e dica sem link', () => {
    render(<StatTile label="Vencidos" value={3} hint="somente descarte" />);
    expect(screen.getByText('Vencidos')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
    expect(screen.getByText('somente descarte')).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('zero real aparece como 0 e sem base aparece como —', () => {
    render(
      <>
        <StatTile label="Vencidos" value={0} />
        <StatTile label="Perdas" value="—" hint="Sem registros no período" />
      </>,
    );
    expect(screen.getByText('0')).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
  });

  it('com link vira um link de área com nome acessível e respeita Ctrl', async () => {
    const onNavigate = vi.fn();
    render(
      <StatTile
        label="Vencem hoje"
        value={2}
        tone="today"
        link={{ href: '/?area=validade', onNavigate }}
      />,
    );
    const link = screen.getByRole('link', { name: /Vencem hoje/ });
    expect(link).toHaveAccessibleName(/2/);
    await userEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    fireEvent.click(link, { ctrlKey: true });
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe('StatePanel', () => {
  it('carregando é role=status', () => {
    render(<StatePanel kind="loading" message="Carregando validades…" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Carregando validades…',
    );
  });

  it('erro é role=alert e "Tentar novamente" chama a repetição', async () => {
    const onRetry = vi.fn();
    render(
      <StatePanel
        kind="error"
        message="Não foi possível carregar."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível carregar.',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Tentar novamente' }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('erro sem repetição não mostra botão', () => {
    render(<StatePanel kind="error" message="Sem acesso." />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('vazio mostra a mensagem e a próxima ação; não é status nem alerta', () => {
    render(
      <StatePanel
        kind="empty"
        message="Nenhum recipiente."
        action={<button type="button">Receber</button>}
      />,
    );
    expect(screen.getByText('Nenhum recipiente.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Receber' })).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('zero real mostra a mensagem sem ação', () => {
    render(
      <StatePanel kind="zero" message="Nada vencido nem vencendo hoje." />,
    );
    expect(screen.getByText('Nada vencido nem vencendo hoje.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('PageHeader', () => {
  it('título é h2 e descrição e ações aparecem', () => {
    render(
      <PageHeader
        title="Validades"
        description="Recipientes da unidade."
        primary={<button type="button">+ Recebimento</button>}
        secondary={<a href="/">Etiquetas</a>}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Validades' }),
    ).toBeVisible();
    expect(screen.getByText('Recipientes da unidade.')).toBeVisible();
    expect(screen.getByRole('button', { name: '+ Recebimento' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Etiquetas' })).toBeVisible();
  });

  it('sem ações não cria o grupo de ações', () => {
    const { container } = render(<PageHeader title="Ajustes" />);
    expect(container.querySelector('.ui-page-actions')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Ajustes',
    );
  });
});
