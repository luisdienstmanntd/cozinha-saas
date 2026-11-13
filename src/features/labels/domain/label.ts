import { z } from 'zod';

const uuid = z.uuid();
export const labelDataSchema = z.object({
  id: uuid,
  // Fatia 6.2: código curto e saldo calculado no servidor (list_containers), lidos a cada consulta.
  short_code: z.string().regex(/^C-\d{6,}$/),
  balance: z.number(),
  batch_receipts: z.object({
    source_code: z.string(),
    quantity: z.number(),
    unit: z.string(),
    expiry_date: z.iso.date(),
    expiry_origin: z.enum(['original', 'responsible']),
    products: z.object({ name: z.string() }),
  }),
});
export type LabelData = z.infer<typeof labelDataSchema>;
export function containerPath(id: string) {
  return `/recipiente/${uuid.parse(id)}`;
}
export function parseContainerPath(path: string) {
  const match = /^\/recipiente\/([^/]+)$/.exec(path);
  const result = uuid.safeParse(match?.[1]);
  return result.success ? result.data : null;
}
