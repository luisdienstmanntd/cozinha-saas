import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// PR-14 do roadmap de interface: a base global do CSS fica neutra. Margens e títulos grandes da tela
// de demonstração valem só dentro de `.page`; o app não herda espaçamento de `button`, `button span`
// ou `h1` soltos. Este teste lê o arquivo real para que um seletor global volte a escorregar.
const css = readFileSync('src/app/styles.css', 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
const rules = [...css.matchAll(/(?<=^|\})\s*([^{}@]+)\{([^{}]*)\}/g)].map(
  (match) => ({ selector: match[1]!.trim(), body: match[2]! }),
);

function globalRules(selector: string) {
  return rules.filter((rule) =>
    rule.selector.split(',').some((part) => part.trim() === selector),
  );
}

describe('CSS base neutro', () => {
  it.each(['button', 'button span', 'button:hover', 'h1'])(
    'o seletor global "%s" não define margem nem título grande',
    (selector) => {
      for (const rule of globalRules(selector)) {
        expect(rule.body).not.toMatch(/margin/);
        expect(rule.body).not.toMatch(/font-size:\s*clamp/);
      }
    },
  );

  it('a margem de botão e o título grande da demonstração ficam em .page', () => {
    expect(globalRules('.page button')[0]?.body).toMatch(/margin-top/);
    expect(globalRules('.page button span')[0]?.body).toMatch(/margin-left/);
    expect(globalRules('.page h1')[0]?.body).toMatch(/clamp/);
  });
});
