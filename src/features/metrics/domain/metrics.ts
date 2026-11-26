import { z } from 'zod';

// D-076: indicadores da unidade lidos de `pilot_metrics` (só leitura, SECURITY INVOKER: a RLS filtra).
// Nenhuma regra nova: a tela só mostra o que o banco já conta. Contagens vêm como bigint e tempos em
// segundos (numeric); sem registros, mediana e máximo vêm nulos.

const count = z.union([z.number(), z.string()]).transform((value, context) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    context.addIssue({ code: 'custom', message: 'contagem inválida' });
    return z.NEVER;
  }
  return parsed;
});
const seconds = z
  .union([z.number(), z.string(), z.null()])
  .transform((value, context) => {
    if (value === null) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      context.addIssue({ code: 'custom', message: 'tempo inválido' });
      return z.NEVER;
    }
    return parsed;
  });

export const metricsSchema = z.object({
  handlings_total: count,
  handlings_same_expiry: count,
  handlings_shorter_expiry: count,
  handlings_late: count,
  handling_delay_p50_seconds: seconds,
  handling_delay_max_seconds: seconds,
  occurrences_total: count,
  occurrences_late_handling: count,
  occurrences_undecided: count,
  decisions_total: count,
  decision_wait_p50_seconds: seconds,
  decision_wait_max_seconds: seconds,
  handling_voids_total: count,
  location_moves_total: count,
  containers_expired_with_balance: count,
  productions_total: count,
  productions_late: count,
  production_delay_p50_seconds: seconds,
  production_delay_max_seconds: seconds,
  production_voids_total: count,
  production_portionings_total: count,
  occurrences_late_production: count,
});
export type UnitMetrics = z.infer<typeof metricsSchema>;

export const PERIOD_DAYS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIOD_DAYS)[number];
export const DEFAULT_PERIOD: PeriodDays = 30;
export const periodLabels: Record<PeriodDays, string> = {
  7: 'Últimos 7 dias',
  30: 'Últimos 30 dias',
  90: 'Últimos 90 dias',
};

export type Period = { from: Date; to: Date };

/** Janela que termina agora e começa `days` dias antes (o banco aceita no máximo 366 dias). */
export function periodEnding(now: Date, days: PeriodDays): Period {
  return { from: new Date(now.getTime() - days * 86_400_000), to: now };
}

/** Tempo legível a partir de segundos; nulo quando não houve registro no período. */
export function elapsedText(total: number | null): string | null {
  if (total === null) return null;
  const minutes = Math.round(total / 60);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} d ${rest} h` : `${days} d`;
}

/** Parte de um total em porcentagem inteira; nulo sem base. */
export function shareText(part: number, total: number): string | null {
  if (total <= 0) return null;
  return `${Math.round((part / total) * 100)}% do total`;
}
