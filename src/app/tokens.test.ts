import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// PR-02 do roadmap de interface: os tokens de estado de validade, tipografia e densidade ficam em
// `tokens.css`. Este teste lê o arquivo real e mede o contraste de cada par (WCAG 2.2: 4,5:1 para texto
// normal e 3:1 para informação visual funcional), para que uma cor trocada sem medir quebre a CI.
const css = readFileSync('src/app/tokens.css', 'utf8');
const declared = new Map<string, string>(
  [...css.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(
    (match) => [match[1]!, match[2]!.trim()] as const,
  ),
);

function value(name: string): string {
  let current = declared.get(name);
  expect(current, `token ${name} não declarado`).toBeDefined();
  for (let depth = 0; depth < 5 && current!.startsWith('var('); depth += 1)
    current = declared.get(current!.slice(4, -1).trim());
  return current!;
}

function luminance(hex: string): number {
  let digits = hex.replace('#', '');
  if (digits.length === 3) digits = [...digits].map((c) => c + c).join('');
  const channels = digits
    .match(/../g)!
    .map((part) => parseInt(part, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (light! + 0.05) / (dark! + 0.05);
}

const states = ['overdue', 'today', 'tomorrow', 'later', 'depleted'] as const;

describe('tokens de estado de validade', () => {
  it.each(states)(
    '%s: texto legível sobre o fundo do selo (≥ 4,5:1)',
    (state) => {
      expect(
        contrast(
          value(`--status-${state}-text`),
          value(`--status-${state}-surface`),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(states)(
    '%s: texto legível sobre o painel branco (≥ 4,5:1)',
    (state) => {
      expect(
        contrast(value(`--status-${state}-text`), value('--surface-panel')),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(['overdue', 'today', 'tomorrow', 'later'] as const)(
    '%s: borda funcional visível sobre o painel (≥ 3:1)',
    (state) => {
      expect(
        contrast(value(`--status-${state}-edge`), value('--surface-panel')),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it('"vence hoje" e "vence amanhã" têm cores diferentes', () => {
    for (const part of ['text', 'surface', 'edge'])
      expect(value(`--status-today-${part}`)).not.toBe(
        value(`--status-tomorrow-${part}`),
      );
  });

  it('o laranja da marca não é usado como cor de alerta', () => {
    const brand = value('--brand-accent').toLowerCase();
    for (const state of states)
      for (const part of ['text', 'surface', 'edge'])
        expect(value(`--status-${state}-${part}`).toLowerCase()).not.toBe(
          brand,
        );
  });
});

describe('tokens existentes continuam legíveis', () => {
  it.each([
    ['--text-primary', '--surface-panel'],
    ['--text-primary', '--surface-canvas'],
    ['--text-secondary', '--surface-panel'],
    ['--text-secondary', '--surface-canvas'],
    ['--action-on-primary', '--action-primary'],
    ['--text-on-dark', '--surface-nav'],
    ['--danger-text', '--danger-surface'],
    ['--warning-text', '--warning-surface'],
    ['--info-text', '--info-surface'],
  ])('%s sobre %s ≥ 4,5:1', (text, surface) => {
    expect(contrast(value(text), value(surface))).toBeGreaterThanOrEqual(4.5);
  });

  it('contorno de controle ≥ 3:1 sobre painel e fundo', () => {
    for (const surface of ['--surface-panel', '--surface-canvas'])
      expect(
        contrast(value('--border-control'), value(surface)),
      ).toBeGreaterThanOrEqual(3);
  });
});

describe('tokens de tipografia e densidade', () => {
  const scale = ['xs', 'sm', 'md', 'lg', 'xl', 'num'];

  it('escala tipográfica em rem, crescente', () => {
    const sizes = scale.map((name) => {
      const raw = value(`--text-${name}`);
      expect(raw).toMatch(/^[\d.]+rem$/);
      return parseFloat(raw);
    });
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it('corpo de 16 px (1rem) para campos editáveis em toque', () => {
    expect(value('--text-md')).toBe('1rem');
  });

  it('alvo de toque de 44 px e itens de menu de ponteiro fino mais baixos', () => {
    expect(value('--touch-target')).toBe('44px');
    expect(value('--nav-item-h')).toBe('44px');
    expect(parseInt(value('--nav-item-h-pointer'), 10)).toBeLessThan(44);
    expect(parseInt(value('--nav-item-h-pointer'), 10)).toBeGreaterThanOrEqual(
      32,
    );
  });

  it('espaços e sombra de camada declarados', () => {
    for (const name of ['--panel-pad', '--row-h', '--shadow-overlay'])
      expect(value(name)).not.toBe('');
  });
});

describe('PR-04: a tela usa os tokens de estado', () => {
  const styles = readFileSync('src/app/styles.css', 'utf8');
  const rule = (selector: string) =>
    styles.match(
      new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`),
    )?.[1] ?? '';

  it.each([
    ['.tile.tone-today', 'today'],
    ['.tile.tone-tomorrow', 'tomorrow'],
    ['.tile.tone-overdue', 'overdue'],
  ])('%s usa as cores do seu estado', (selector, state) => {
    expect(rule(selector)).toContain(`--status-${state}-text`);
    expect(rule(selector)).toContain(`--status-${state}-surface`);
  });

  it('o selo antigo (.expiry-badge e .mesa-status) não existe mais', () => {
    expect(styles).not.toMatch(/\.expiry-badge|\.mesa-status/);
  });
});
