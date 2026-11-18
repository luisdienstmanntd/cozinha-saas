import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UnitNav } from './UnitNav';
import { areasFor } from '../domain/areas';

const areas = areasFor({ owner: true, production: true, locations: true });
const hrefFor = (id: string) => `/?unidade=x&area=${id}`;

describe('navegação da unidade (V1)', () => {
  it('lista as áreas como links com endereço próprio e marca a atual', () => {
    render(
      <UnitNav
        areas={areas}
        current="receber"
        hrefFor={hrefFor}
        onSelect={() => {}}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Áreas da unidade' });
    expect(nav).toBeVisible();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      'Validade',
      'Receber',
      'Produção',
      'Locais',
      'Cadastros',
    ]);
    expect(screen.getByRole('link', { name: 'Receber' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Validade' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('link', { name: 'Locais' })).toHaveAttribute(
      'href',
      '/?unidade=x&area=locais',
    );
  });
  it('clique simples troca de área sem recarregar; com tecla modificadora segue o navegador', async () => {
    const onSelect = vi.fn();
    render(
      <UnitNav
        areas={areas}
        current="validade"
        hrefFor={hrefFor}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByRole('link', { name: 'Produção' }));
    expect(onSelect).toHaveBeenCalledWith('producao');
    onSelect.mockClear();
    // Ctrl+clique abre em nova aba: não é interceptado.
    const link = screen.getByRole('link', { name: 'Locais' });
    const notPrevented = fireEvent.click(link, { ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });
});
