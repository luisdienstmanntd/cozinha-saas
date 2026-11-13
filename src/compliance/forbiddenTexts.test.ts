import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { makeLabelPdf } from '../features/labels/application/pdf';
import type { LabelData } from '../features/labels/domain/label';

// Teste 16 do desenho (I-15): o produto não afirma conformidade sanitária. Até a conferência normativa
// por nutricionista RT (Q10), nenhum texto fixo da tela, do PDF ou das mensagens do banco promete
// conformidade, segurança do alimento, aprovação de órgão ou cita norma e órgão pelo nome.
const FORBIDDEN = [
  /garante?\s+(a\s+)?conformidade/i,
  /conformidade\s+sanit[aá]ria/i,
  /\bconforme\b/i,
  /\bconformes?\b/i,
  /dentro\s+das?\s+normas?/i,
  /seguro\s+para\s+(o\s+)?consumo/i,
  /pr[oó]prio\s+para\s+(o\s+)?consumo/i,
  /aprovad[oa]s?\s+pela\s+vigil[aâ]ncia/i,
  /\baprovad[oa]s?\b/i,
  /\bregularizad[oa]s?\b/i,
  /\bcertificad[oa]s?\b/i,
  /vigil[aâ]ncia\s+sanit[aá]ria/i,
  /\banvisa\b/i,
  /\bRDC\b/,
  /\bportaria\b/i,
  /\bSES\/RS\b/i,
];

function files(dir: string, test: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path, test);
    return test(entry.name) ? [path] : [];
  });
}
function offenders(text: string) {
  return FORBIDDEN.filter((pattern) => pattern.test(text)).map(String);
}

it('textos da interface não afirmam conformidade sanitária', () => {
  const sources = files(
    join(process.cwd(), 'src'),
    (name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name),
  );
  expect(sources.length).toBeGreaterThan(20);
  const found = sources.flatMap((path) =>
    offenders(readFileSync(path, 'utf8')).map((term) => `${path}: ${term}`),
  );
  expect(found).toEqual([]);
});

it('mensagens de erro do banco não afirmam conformidade sanitária', () => {
  const migrations = files(
    join(process.cwd(), 'supabase', 'migrations'),
    (name) => name.endsWith('.sql'),
  );
  const messages = migrations.flatMap((path) =>
    [
      ...readFileSync(path, 'utf8').matchAll(
        /raise exception '((?:[^']|'')*)'/g,
      ),
    ].map((match) => ({ path, message: match[1]! })),
  );
  expect(messages.length).toBeGreaterThan(50);
  const found = messages.flatMap(({ path, message }) =>
    offenders(message).map((term) => `${path}: ${message} (${term})`),
  );
  expect(found).toEqual([]);
});

it('texto extraído das etiquetas PDF não afirma conformidade sanitária', async () => {
  const base: LabelData = {
    id: '12345678-1234-4234-8234-123456789abc',
    short_code: 'C-000001',
    balance: 1,
    batch_receipts: {
      source_code: '0001',
      quantity: 1,
      unit: 'kg',
      expiry_date: '2027-01-01',
      expiry_origin: 'responsible',
      products: { name: 'Frango' },
    },
  };
  for (const hold of [null, 'pending', 'rejected'] as const) {
    const blob = await makeLabelPdf({ ...base, hold }, 'http://127.0.0.1:5173');
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
    // Só o texto desenhado (operadores "(...) Tj"), não os metadados do arquivo.
    const drawn = [...text.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)]
      .map((match) => match[1])
      .join(' ');
    expect(drawn.length).toBeGreaterThan(20);
    expect(offenders(drawn)).toEqual([]);
  }
});

it('a lista pega as expressões que ela proíbe', () => {
  for (const sample of [
    'Lote em conformidade sanitária',
    'Produto dentro das normas',
    'Seguro para consumo',
    'Aprovado pela vigilância',
    'Conforme a RDC 216',
    'Regularizado',
  ])
    expect(offenders(sample).length).toBeGreaterThan(0);
  expect(
    offenders('Decida seguindo o procedimento sanitário da cozinha.'),
  ).toEqual([]);
});
