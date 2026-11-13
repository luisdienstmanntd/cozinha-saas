import { z } from 'zod';

// Linha do painel (fatia 6.2): um recipiente com saldo calculado no servidor (list_containers).
export const containerRowSchema = z.object({
  container_id: z.uuid(),
  short_code: z.string().regex(/^C-\d{6,}$/),
  kind: z.enum(['integral', 'derived']),
  parent_container_id: z.uuid().nullable(),
  batch_id: z.uuid(),
  product_id: z.uuid(),
  product_name: z.string().min(1),
  unit: z.string(),
  source_code: z.string(),
  expiry_date: z.iso.date(),
  expiry_origin: z.enum(['receipt', 'handling']),
  batch_expiry_origin: z.enum(['original', 'responsible']),
  initial_quantity: z.number(),
  balance: z.number(),
  timezone: z.string(),
  created_at: z.string(),
});
export type ContainerRow = z.infer<typeof containerRowSchema>;

export const expirySummarySchema = z.object({
  overdue: z.number().int().nonnegative(),
  due_today: z.number().int().nonnegative(),
  due_tomorrow: z.number().int().nonnegative(),
  later: z.number().int().nonnegative(),
});
export type ExpirySummary = z.infer<typeof expirySummarySchema>;

export type ContainerCursor = { expiryDate: string; id: string };
export type ContainerPage = {
  rows: ContainerRow[];
  next: ContainerCursor | null;
};
export type ContainerQuery = {
  includeDepleted: boolean;
  search: string;
  after: ContainerCursor | null;
};
// Tamanho da página do painel; o servidor aceita até 200.
export const CONTAINER_PAGE_SIZE = 100;
