// D-075: o logo vai embutido no pacote e, se a imagem falhar, o nome aparece escrito.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './BrandLogo';

describe('logo CozziGo', () => {
  it('usa a imagem embutida (data URL), sem depender de outro download', () => {
    render(<BrandLogo />);
    const image = screen.getByRole('img', { name: 'CozziGo' });
    expect(image.getAttribute('src')).toMatch(/^data:image\/webp;base64,/);
  });

  it('a marca compacta também vem embutida', () => {
    render(<BrandLogo variant="mark" alt="CozziGo" />);
    expect(
      screen.getByRole('img', { name: 'CozziGo' }).getAttribute('src'),
    ).toMatch(/^data:image\/webp;base64,/);
  });

  it('se a imagem falhar, mostra o nome escrito em vez de uma caixa vazia', () => {
    render(<BrandLogo />);
    fireEvent.error(screen.getByRole('img', { name: 'CozziGo' }));
    const fallback = screen.getByRole('img', { name: 'CozziGo' });
    expect(fallback.tagName).toBe('SPAN');
    expect(fallback).toHaveTextContent('CozziGo');
  });

  it('decorativo (alt vazio) fica fora da leitura de tela também no texto de reserva', () => {
    const { container } = render(<BrandLogo variant="mark" alt="" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('.brand-fallback')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
