import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { makeLabelsPdf } from './pdf';
import type { LabelData } from '../domain/label';

// Prévia da etiqueta (M9): o texto passou a vir de `labelContent.ts`, a mesma fonte da prévia em tela.
// Este teste trava que o PDF continua exatamente igual: o SHA-256 de cada modelo foi calculado com o
// gerador ANTERIOR à extração, sem a data de criação do arquivo. Se atualizar o jsPDF ou mudar de propósito
// um texto ou posição da etiqueta, estes valores mudam e precisam ser revistos com cuidado, nunca só trocados.
afterEach(() => vi.useRealTimers());

const base: LabelData = {
  id: '12345678-1234-4234-8234-123456789abc',
  short_code: 'C-000001',
  balance: 1,
  batch_receipts: {
    source_code: '0001',
    quantity: 1.25,
    unit: 'kg',
    expiry_date: '2027-01-01',
    expiry_origin: 'original',
    products: { name: 'Frango' },
  },
};
const derived: LabelData = {
  ...base,
  id: '22345678-1234-4234-8234-123456789abc',
  short_code: 'C-000002',
  kind: 'derived',
  balance: 2,
  storage: 'refrigerated',
  effective: {
    expiry_date: '2026-12-01',
    expiry_origin: 'handling',
    initial_quantity: 2,
  },
  handling: {
    kind: 'portioning',
    handled_at: '2026-11-13T23:22:00Z',
    timezone: 'America/Sao_Paulo',
    handled_by_name: 'Ana',
    expiry_date: '2026-11-18',
    storage: 'refrigerated',
    position: 2,
    siblings: 4,
  },
  batch_receipts: { ...base.batch_receipts, suppliers: { name: 'Granja' } },
};
const prepared: LabelData = {
  id: '42345678-1234-4234-8234-123456789abc',
  short_code: 'C-000123',
  balance: 6,
  kind: 'integral',
  storage: 'refrigerated',
  effective: {
    expiry_date: '2026-11-16',
    expiry_origin: 'receipt',
    initial_quantity: 6,
  },
  production: {
    produced_at: '2026-11-14T14:30:00Z',
    handled_by_name: 'Bruno Lima',
    timezone: 'America/Sao_Paulo',
    late: false,
    voided: null,
  },
  batch_receipts: {
    source_code: null,
    quantity: 6,
    unit: 'l',
    expiry_date: '2026-11-16',
    expiry_origin: 'responsible',
    products: { name: 'Caldo de legumes' },
  },
};
const cases: Record<string, LabelData> = {
  receiptPlain: base,
  receiptFull: {
    ...base,
    storage: 'ambient',
    batch_receipts: {
      ...base.batch_receipts,
      suppliers: { name: 'Horta' },
      expiry_origin: 'responsible',
    },
  },
  receiptHold: { ...base, hold: 'pending' },
  receiptLongName: {
    ...base,
    batch_receipts: {
      ...base.batch_receipts,
      products: {
        name: 'Molho de tomate artesanal com manjericão fresco e azeite extra virgem da safra',
      },
    },
  },
  portion: derived,
  portionHold: { ...derived, hold: 'rejected' },
  opening: {
    ...derived,
    handling: {
      ...derived.handling!,
      kind: 'opening',
      position: 1,
      siblings: 1,
    },
  },
  openingResponsible: {
    ...derived,
    batch_receipts: { ...derived.batch_receipts, expiry_origin: 'responsible' },
    effective: undefined,
  },
  prepared,
  preparedHold: { ...prepared, hold: 'pending' },
  preparedPortion: {
    ...prepared,
    id: '52345678-1234-4234-8234-123456789abc',
    short_code: 'C-000124',
    kind: 'derived',
    balance: 1,
    effective: {
      expiry_date: '2026-11-15',
      expiry_origin: 'handling',
      initial_quantity: 1,
    },
    handling: {
      kind: 'portioning',
      handled_at: '2026-11-14T15:00:00Z',
      timezone: 'America/Sao_Paulo',
      handled_by_name: 'Ana',
      expiry_date: '2026-11-15',
      storage: 'refrigerated',
      position: 2,
      siblings: 6,
    },
  },
};
const norm = (value: string) =>
  value
    .replace(/\/CreationDate \(D:[^)]*\)/g, '')
    .replace(/\/ID \[[^\]]*\]/g, '');
async function digest(list: LabelData[], origin: string) {
  const blob = await makeLabelsPdf(list, origin);
  const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
  return createHash('sha256').update(norm(text)).digest('hex');
}
const expected: Record<string, string> = {
  receiptPlain:
    'b2476fffa56fa0cba2411d6ae28733118c87e9c0662f127e33f77a489600d8a0',
  receiptFull:
    '4037829f34cfb3a785f7c3e2f8f3dc5763037eb635a02bd5f3ecea51b4463e7e',
  receiptHold:
    '182320244cb7050a0ce3153369c761d0430e7a884fb35bccf371383d2cff8d7e',
  receiptLongName:
    '4abb687cad14d9dc3e3dd3aac4430e3f0ddc5870ba4e05ce2ae74f4e02e5c4db',
  portion: '76de414611d2194c0f3f60c707168a9cd71b871847b3f4df896f077cf23f265f',
  portionHold:
    '4c7ec2a04a0748205d8bfc376ac3d8d081860ca1aa6ba61d9920632c2edddb3d',
  opening: '3b1b5b5a0e3c5f9c4e4f908b3be2148b27d01447c6c60d686f93e042fef3107c',
  openingResponsible:
    '82feb7f2eec7aeeec1ff36d417b4d84e47b6b1bd48b468f097e96fb42b98cd77',
  prepared: '79084530b221e7de98bd62ca758cc1bea182d6ef9bf02f3b856cd6a0df364be5',
  preparedHold:
    '3c0a4b876a2e368c5de36b02d3761396e38dbc15d61e94419d216707b75916b1',
  preparedPortion:
    '3ddee2d3f2cb53631f763e88ca79adfd063e5677fa1e4f3cc152e27de0da36c0',
};
it.each(Object.entries(expected))(
  'o PDF do modelo %s é igual ao anterior à extração do texto',
  async (name, hash) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
    expect(await digest([cases[name]!], 'http://127.0.0.1:5173')).toBe(hash);
  },
);
it('o arquivo com todos os modelos em sequência também é igual', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
  expect(await digest(Object.values(cases), 'http://127.0.0.1:5174')).toBe(
    '9e0ffeac5fa7fbde31e0f3950c66d82ec0e67f757da26e8b4367ffc1a736760c',
  );
});
