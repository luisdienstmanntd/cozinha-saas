import { z } from 'zod';
import { storageConditionSchema } from '../../catalog/domain/catalog';

// Fatia 6.6 (desenho 7.1): abrir embalagem ou dividir em porções. O banco (handle_container) decide tudo:
// esta camada só confere a forma, calcula a soma e a sobra para mostrar na revisão e converte o horário
// digitado no fuso da unidade. Nada aqui sugere validade nem calcula prazo.

// Mesma janela de private.handling_late_window(); serve só para o aviso, quem decide é o banco.
export const LATE_WINDOW_MS = 2 * 60 * 60 * 1000;
export const MIN_PORTIONS = 2;
export const MAX_PORTIONS = 20;

const quantity = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/)
  .refine((value) => Number(value) > 0 && Number(value) <= 1_000_000_000);

export const handlingInputSchema = z
  .object({
    sourceContainerId: z.uuid(),
    kind: z.enum(['opening', 'portioning']),
    quantities: quantity.array().min(1).max(MAX_PORTIONS),
    expiryDate: z.iso.date(),
    storage: storageConditionSchema,
    handledAt: z.iso.datetime({ offset: true }),
    handledBy: z.uuid(),
    remainder: z.enum(['none', 'sealed', 'discard', 'portion']),
    remainderReason: z.string().trim().min(1).max(500).nullable(),
    note: z.string().trim().min(1).max(200).nullable(),
    lateReason: z.string().trim().min(1).max(300).nullable(),
    intentId: z.uuid(),
  })
  .refine((v) =>
    v.kind === 'opening'
      ? v.quantities.length === 1
      : v.quantities.length >= MIN_PORTIONS,
  )
  .refine((v) => v.remainder !== 'portion' || v.kind === 'portioning')
  .refine((v) => (v.remainder === 'discard') === (v.remainderReason !== null));
export type HandlingInput = z.infer<typeof handlingInputSchema>;

export const voidInputSchema = z.object({
  handlingId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
  intentId: z.uuid(),
});
export type VoidInput = z.infer<typeof voidInputSchema>;

// Quantidades em milésimos (inteiros), para somar sem erro de ponto flutuante.
export function toMilli(value: string): number {
  const [whole = '0', fraction = ''] = value.trim().split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0').slice(0, 3));
}
export function fromMilli(milli: number): string {
  const whole = Math.trunc(milli / 1000);
  const fraction = String(Math.abs(milli % 1000)).padStart(3, '0');
  return `${whole}.${fraction}`.replace(/\.?0+$/, '');
}
export function isQuantity(value: string) {
  return quantity.safeParse(value).success;
}

// Soma das porções e sobra do saldo, em milésimos. Sobra negativa = excede o saldo.
export function totals(quantities: string[], balance: number) {
  const sum = quantities.reduce(
    (acc, value) => acc + (isQuantity(value) ? toMilli(value) : 0),
    0,
  );
  return { sumMilli: sum, restMilli: Math.round(balance * 1000) - sum };
}

// "Dividir igualmente" só preenche os campos; a última porção absorve a diferença de arredondamento.
export function splitEqually(
  balance: number,
  count: number,
  wholeUnits: boolean,
): string[] {
  const total = Math.round(balance * 1000);
  const step = wholeUnits ? 1000 : 1;
  const each = Math.floor(total / count / step) * step;
  const parts = Array.from({ length: count }, () => each);
  parts[count - 1] = total - each * (count - 1);
  return parts.map(fromMilli);
}

function offsetMinutes(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(v.year),
    Number(v.month) - 1,
    Number(v.day),
    Number(v.hour),
    Number(v.minute),
    Number(v.second),
  );
  return (asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000;
}

// "2026-11-13T09:30" no fuso da unidade → instante ISO. Devolve null se a data não existe.
export function zonedToInstant(local: string, timezone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return null;
  const [y, mo, d, h, mi] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  )
    return null;
  try {
    let guess = wall - offsetMinutes(new Date(wall), timezone) * 60000;
    guess = wall - offsetMinutes(new Date(guess), timezone) * 60000;
    return new Date(guess).toISOString();
  } catch {
    return null;
  }
}

// Instante → valor de <input type="datetime-local"> no fuso da unidade.
export function instantToZoned(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
}

export function isLate(handledAtIso: string, now: Date): boolean {
  return now.getTime() - new Date(handledAtIso).getTime() > LATE_WINDOW_MS;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Recebe só o que o banco devolve como mensagem de recusa conhecida (ver messages.ts).
export const kindLabels = {
  opening: 'Abertura de embalagem',
  portioning: 'Porcionamento',
} as const;
