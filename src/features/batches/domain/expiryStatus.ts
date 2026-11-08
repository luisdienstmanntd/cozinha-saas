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
