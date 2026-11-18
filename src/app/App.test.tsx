import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { configureApp } from './configureApp';
import {
  isHostedLabels,
  labelOrigin,
  setOfficialOrigin,
} from '../features/labels/application/labelOrigin';

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

describe('hospedagem (fatia 8.4a)', () => {
  const hosted = {
    VITE_APP_MODE: 'hosted',
    VITE_SUPABASE_URL: 'https://abcdefghij0123456789.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_exemplo_sem_segredo',
    VITE_APP_ENV: 'testes',
    VITE_APP_URL: 'https://cozzigo.pages.dev',
  };
  it('hospedagem sem variáveis falha de forma explícita, não vira demonstração', () => {
    const configuration = configureApp({}, 'cozinha.pages.dev');
    expect(configuration).toBeNull();
    render(<App configuration={configuration} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Configuração inválida.',
    );
    expect(
      screen.queryByText('Ambiente de demonstração'),
    ).not.toBeInTheDocument();
  });
  it('hospedagem com modo demo ou local também falha', () => {
    expect(
      configureApp({ VITE_APP_MODE: 'demo' }, 'cozinha.pages.dev'),
    ).toBeNull();
    expect(
      configureApp(
        {
          VITE_APP_MODE: 'local',
          VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_exemplo_sem_segredo',
        },
        'cozinha.pages.dev',
      ),
    ).toBeNull();
  });
  it('o erro não mostra valores configurados', () => {
    render(
      <App
        configuration={configureApp(
          { ...hosted, VITE_APP_ENV: 'staging' },
          'cozinha.pages.dev',
        )}
      />,
    );
    expect(document.body.textContent).not.toContain('abcdefghij0123456789');
    expect(document.body.textContent).not.toContain('sb_publishable_');
  });
  it('configuração hospedada completa abre o acesso com aviso de ambiente de testes', async () => {
    render(<App configuration={configureApp(hosted, 'cozinha.pages.dev')} />);
    expect(screen.getByText('Ambiente de testes.')).toBeVisible();
    expect(await screen.findByLabelText(/E-mail/)).toBeVisible();
  });
});

describe('endereço oficial das etiquetas (fatia 8.4b)', () => {
  const hosted = {
    VITE_APP_MODE: 'hosted',
    VITE_SUPABASE_URL: 'https://abcdefghij0123456789.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_exemplo_sem_segredo',
    VITE_APP_ENV: 'testes',
    VITE_APP_URL: 'https://cozzigo.pages.dev',
  };
  afterEach(() => setOfficialOrigin(null));
  it('hospedagem guarda o endereço oficial e a hospedagem sem ele falha', () => {
    expect(configureApp(hosted, 'cozzigo.pages.dev')).not.toBeNull();
    expect(labelOrigin()).toBe('https://cozzigo.pages.dev');
    expect(
      configureApp({ ...hosted, VITE_APP_URL: undefined }, 'cozzigo.pages.dev'),
    ).toBeNull();
  });
  it('demonstração não guarda endereço oficial', () => {
    configureApp(hosted, 'cozzigo.pages.dev');
    configureApp({ VITE_APP_MODE: 'demo' });
    expect(isHostedLabels()).toBe(false);
  });
});
