import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// V5B (D-064): guarda contra regressão. Nenhuma tela, etiqueta ou texto de tentativa interpola uma
// quantidade ou um saldo "crus" (o número do banco, com ponto). Tudo passa por formatQuantity.
// O valor de um campo de digitação (`value={quantity}`) é texto digitado, não exibição, e fica de fora.
// A varredura procura expressões que são só o campo (`{row.balance}`, `${input.quantity}`,
// `{voided ? 0 : child.balance}`); o que está entre parênteses de formatQuantity não casa.
const FIELD = String.raw`(?:balance|quantity|initial_quantity|remainder_quantity)`;
const RAW = new RegExp(
  String.raw`(?<!\bvalue=)(?:\$\{|\{)\s*(?:[^{}()]*\?\s*0\s*:\s*)?[\w$.?]*\b${FIELD}\s*\}`,
  'g',
);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

it('nenhum texto mostra quantidade ou saldo sem passar por formatQuantity', () => {
  const found: string[] = [];
  for (const file of sources('src')) {
    const text = withoutComments(readFileSync(file, 'utf8'));
    for (const match of text.matchAll(RAW)) found.push(`${file}: ${match[0]}`);
  }
  expect(found).toEqual([]);
});

it('a própria varredura reconhece os padrões crus que deve barrar', () => {
  for (const raw of [
    '{row.balance}',
    '{data.effective?.initial_quantity}',
    '`saldo ${container.balance} kg`',
    '{voided ? 0 : child.balance}',
    '${input.quantity}',
  ])
    expect(raw.match(RAW), raw).not.toBeNull();
  for (const ok of [
    '{formatQuantity(row.balance)}',
    '${formatQuantity(input.quantity)}',
    '{ quantity: 1 }',
    'value={quantity}',
  ])
    expect(ok.match(RAW), ok).toBeNull();
});
