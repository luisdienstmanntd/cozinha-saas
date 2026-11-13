import { z } from 'zod';

// Fatia 6.5b: ocorrências da unidade lidas pelo servidor (list_occurrences, SECURITY INVOKER). A regra de
// bloqueio é do banco (container_blocks); a tela só mostra o que ele devolve.
export const occurrenceRowSchema = z.object({
  occurrence_id: z.uuid(),
  kind: z.enum(['temperature_not_measured', 'late_handling']),
  batch_id: z.uuid(),
  handling_id: z.uuid().nullable(),
  product_name: z.string().min(1),
  source_code: z.string(),
  unit: z.string(),
  reason: z.string().min(1),
  created_at: z.string(),
  timezone: z.string(),
  status: z.enum(['pending', 'released', 'rejected']),
  decision_reason: z.string().nullable(),
  decided_at: z.string().nullable(),
  containers: z
    .object({
      container_id: z.uuid(),
      short_code: z.string(),
      kind: z.enum(['integral', 'derived']),
      balance: z.number(),
    })
    .array(),
});
export type OccurrenceRow = z.infer<typeof occurrenceRowSchema>;
export type OccurrenceScope = 'open' | 'all';
export const OCCURRENCE_LIMIT = 200;

export type Decision = 'released' | 'rejected';
export const decisionInputSchema = z.object({
  occurrenceId: z.uuid(),
  decision: z.enum(['released', 'rejected']),
  reason: z.string().trim().min(1).max(500),
  intentId: z.uuid(),
});
export type DecisionInput = z.infer<typeof decisionInputSchema>;

export const kindLabels = {
  temperature_not_measured: 'Recebimento sem medição de temperatura',
  late_handling: 'Manipulação registrada mais de 2 horas depois de feita',
} as const;

// Texto curto do bloqueio, o mesmo no painel, na etiqueta e no recipiente.
export const BLOCK_TEXT = {
  pending: 'BLOQUEADO - aguardando decisão',
  rejected: 'REJEITADO - somente descarte',
} as const;
export type BlockStatus = keyof typeof BLOCK_TEXT;

// Data e hora no fuso da unidade em que a ocorrência foi registrada.
export function formatAt(iso: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function elapsedSince(iso: string, now: Date) {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - new Date(iso).getTime()) / 60000),
  );
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} dias`;
}

// Recipientes bloqueados, a partir das ocorrências abertas (sem decisão primeiro).
export function blockedContainers(rows: OccurrenceRow[]) {
  const map = new Map<string, BlockStatus>();
  for (const row of rows) {
    if (row.status === 'released') continue;
    for (const container of row.containers) {
      if (map.get(container.container_id) !== 'rejected')
        map.set(container.container_id, row.status);
    }
  }
  return map;
}
