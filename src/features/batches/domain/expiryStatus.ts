export type ExpiryStatus = 'overdue' | 'today' | 'tomorrow' | 'upcoming';

export function localCivilDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function nextCivilDate(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function getExpiryStatus(
  expiryDate: string,
  timezone: string,
  now: Date = new Date(),
): ExpiryStatus {
  const today = localCivilDate(now, timezone);
  if (expiryDate < today) return 'overdue';
  if (expiryDate === today) return 'today';
  if (expiryDate === nextCivilDate(today)) return 'tomorrow';
  return 'upcoming';
}

// Fatia 6.11: faixa de recipiente vencido. Só compara a validade registrada com a data de hoje no fuso
// da unidade (a mesma regra do banco, que recusa o consumo); não calcula prazo nem avalia o alimento.
export const EXPIRED_TEXT = 'VENCIDO - somente descarte';
export const EXPIRED_NOTE =
  'a validade registrada já passou na data da unidade. O consumo é recusado; o descarte continua permitido.';

export function isExpired(
  expiryDate: string,
  timezone: string,
  now: Date = new Date(),
): boolean {
  return getExpiryStatus(expiryDate, timezone, now) === 'overdue';
}
