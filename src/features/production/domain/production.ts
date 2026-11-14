import { z } from 'zod';

// Fatia 7.3 (desenho da Fase 7, seções 4.6, 4.7 e 5.1): registrar e anular produção da cozinha pela tela.
// O banco (register_production, void_production) decide tudo; esta camada só confere a forma, converte o
// horário digitado no fuso da unidade e escreve a validade por extenso para a pessoa conferir. Nada aqui
// sugere, calcula ou limita prazo (D-004): a contagem de dias da revisão é só conferência do que foi
// digitado.

const quantity = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/)
  .refine((value) => Number(value) > 0 && Number(value) <= 1_000_000_000);

export const productionInputSchema = z.object({
  productId: z.uuid(),
  quantity,
  expiryDate: z.iso.date(),
  producedAt: z.iso.datetime({ offset: true }),
  handledBy: z.uuid(),
  note: z.string().trim().min(1).max(300).nullable(),
  lateReason: z.string().trim().min(1).max(300).nullable(),
  intentId: z.uuid(),
});
export type ProductionInput = z.infer<typeof productionInputSchema>;

export const productionVoidInputSchema = z.object({
  batchId: z.uuid(),
  reason: z.string().trim().min(1).max(300),
  intentId: z.uuid(),
});
export type ProductionVoidInput = z.infer<typeof productionVoidInputSchema>;

export const productionRowSchema = z.object({
  batch_id: z.uuid(),
  product_name: z.string().min(1),
  quantity: z.number(),
  unit: z.string(),
  expiry_date: z.iso.date(),
  produced_at: z.string(),
  late: z.boolean(),
  handled_by_name: z.string(),
  note: z.string().nullable(),
  timezone: z.string(),
  container_id: z.uuid().nullable(),
  short_code: z.string().nullable(),
  voided: z.object({ reason: z.string(), created_at: z.string() }).nullable(),
});
export type ProductionRow = z.infer<typeof productionRowSchema>;

// Mensagens de recusa do banco que a tela repete. Lista exata; um teste confere que cada uma existe nas
// migrações.
export const PRODUCTION_MESSAGES = [
  'Quantidade inválida.',
  'Só item do catálogo marcado como preparação pode ser produzido.',
  'Defina a conservação da preparação antes de registrar a produção.',
  'O horário da produção não pode estar no futuro.',
  'Produção registrada mais de 2 horas depois de feita exige justificativa do atraso. Siga o procedimento da cozinha.',
  'Justificativa de atraso só vale para produção registrada mais de 2 horas depois de feita.',
  'A validade não pode ser anterior à data da produção.',
  'A validade não pode ser anterior à data do registro.',
  'A pessoa que produziu precisa ter vínculo ativo com a empresa.',
  'Defina o nome de exibição da pessoa que produziu antes de registrar.',
  'Informe o motivo da anulação.',
  'Esta produção já foi anulada.',
  'Só lote produzido pela cozinha é anulado por aqui; recebimento usa o descarte com motivo.',
  'A produção já teve consumo, descarte, porcionamento ou mudança de local: não pode ser anulada. Use o descarte com motivo.',
] as const;

export function knownProductionMessage(message: unknown): string | null {
  return typeof message === 'string' &&
    (PRODUCTION_MESSAGES as readonly string[]).includes(message)
    ? message
    : null;
}

const WEEKDAYS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const;

function civilUtc(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number) as [number, number, number];
  const value = Date.UTC(y, m - 1, d);
  const check = new Date(value);
  return check.getUTCFullYear() === y &&
    check.getUTCMonth() === m - 1 &&
    check.getUTCDate() === d
    ? value
    : null;
}

// Dias entre a data da produção e a validade digitada (datas civis da unidade). Só para conferência.
export function daysBetween(producedDate: string, expiryDate: string) {
  const from = civilUtc(producedDate);
  const to = civilUtc(expiryDate);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86_400_000);
}

// "16/11/2026 (segunda-feira), 2 dias depois da produção": a pessoa confere o que digitou.
export function expiryInWords(producedDate: string, expiryDate: string) {
  const value = civilUtc(expiryDate);
  const days = daysBetween(producedDate, expiryDate);
  if (value === null || days === null) return null;
  const [y, m, d] = expiryDate.split('-');
  const weekday = WEEKDAYS[new Date(value).getUTCDay()];
  const distance =
    days === 0
      ? 'no mesmo dia da produção'
      : days === 1
        ? '1 dia depois da produção'
        : days > 1
          ? `${days} dias depois da produção`
          : 'antes da data da produção';
  return `${d}/${m}/${y} (${weekday}), ${distance}`;
}

// Data civil da unidade de um valor de <input type="datetime-local"> ("2026-11-14T09:30").
export function localDateOf(local: string) {
  return /^\d{4}-\d{2}-\d{2}/.exec(local)?.[0] ?? null;
}
