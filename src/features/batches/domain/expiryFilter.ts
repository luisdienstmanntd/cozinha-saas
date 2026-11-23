import type { ContainerCursor, ContainerPage } from './container';

// V6 (D-072): os quatro contadores de validade filtram a lista. Cada categoria é um trecho contínuo da
// ordem do servidor (validade, recipiente), contado a partir da mesma data de referência do resumo
// (container_expiry_summary). O começo vai ao servidor como cursor; o fim corta a página recebida.
// Nada aqui classifica o alimento: só compara a validade registrada com a data da unidade.

export const EXPIRY_FILTERS = [
  'vencidos',
  'hoje',
  'amanha',
  'posteriores',
] as const;
export type ExpiryFilter = (typeof EXPIRY_FILTERS)[number];

export const expiryFilterLabels: Record<ExpiryFilter, string> = {
  vencidos: 'Vencidos',
  hoje: 'Vence hoje',
  amanha: 'Vence amanhã',
  posteriores: 'Posteriores',
};

export function parseExpiryFilter(value: string | null): ExpiryFilter | null {
  return EXPIRY_FILTERS.find((filter) => filter === value) ?? null;
}

// Maior identificador possível: (data, MAX) deixa de fora todos os recipientes daquela data.
export const MAX_CONTAINER_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function shiftCivilDate(date: string, days: number): string {
  if (!CIVIL_DATE.test(date)) throw new Error('Data civil inválida.');
  const value = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(value.getTime()) ||
    value.toISOString().slice(0, 10) !== date
  )
    throw new Error('Data civil inválida.');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Cursor que faz o servidor começar no primeiro recipiente da categoria (nulo = começo da lista). */
export function expiryFilterStart(
  filter: ExpiryFilter,
  referenceDate: string,
): ContainerCursor | null {
  const offset = { vencidos: null, hoje: -1, amanha: 0, posteriores: 1 }[
    filter
  ];
  return offset === null
    ? null
    : {
        expiryDate: shiftCivilDate(referenceDate, offset),
        id: MAX_CONTAINER_ID,
      };
}

/** A validade pertence à categoria na data de referência (mesma regra das contagens). */
export function inExpiryFilter(
  filter: ExpiryFilter,
  referenceDate: string,
  expiryDate: string,
): boolean {
  const tomorrow = shiftCivilDate(referenceDate, 1);
  switch (filter) {
    case 'vencidos':
      return expiryDate < referenceDate;
    case 'hoje':
      return expiryDate === referenceDate;
    case 'amanha':
      return expiryDate === tomorrow;
    case 'posteriores':
      return expiryDate > tomorrow;
  }
}

/**
 * Corta a página no fim da categoria. A página vem ordenada e já começa na categoria; quando algum
 * recipiente passa do fim, a categoria acabou e não há página seguinte.
 */
export function trimToExpiryFilter(
  filter: ExpiryFilter,
  referenceDate: string,
  page: ContainerPage,
): ContainerPage {
  const rows = page.rows.filter((row) =>
    inExpiryFilter(filter, referenceDate, row.expiry_date),
  );
  return {
    rows,
    next: rows.length < page.rows.length ? null : page.next,
  };
}
