import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DemoHome } from './DemoHome';

describe('tela inicial de demonstração', () => {
  it('informa limites, confirma ciência e permite retirar a confirmação', async () => {
    const user = userEvent.setup();
    render(<DemoHome />);
    expect(screen.getByText('Ambiente de demonstração')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Cada recipiente, uma história clara.',
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirmar escopo da demonstração' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Confirme que esta demonstração não salva dados.',
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Entendo que esta demonstração não salva dados.',
      }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirmar escopo da demonstração' }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Escopo confirmado.');
    expect(
      screen.getByRole('heading', { name: 'O fluxo que vamos construir' }),
    ).toBeVisible();
    await user.click(screen.getByRole('checkbox'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirmar escopo da demonstração' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Confirme que esta demonstração não salva dados.',
    );
  });
});
