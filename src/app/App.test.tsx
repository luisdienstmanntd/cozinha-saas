import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { configureApp } from './configureApp';

describe('inicialização', () => {
  it('apresenta demonstração com configuração válida', () => {
    render(<App configuration={configureApp({ VITE_APP_MODE: 'demo' })} />);
    expect(screen.getByText('Ambiente de demonstração')).toBeVisible();
  });
  it('mostra erro e impede demonstração quando configuração é inválida', () => {
    render(
      <App configuration={configureApp({ VITE_APP_MODE: 'production' })} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Configuração inválida.',
    );
    expect(
      screen.queryByRole('button', {
        name: 'Confirmar escopo da demonstração',
      }),
    ).not.toBeInTheDocument();
  });
});
