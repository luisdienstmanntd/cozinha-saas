import { z } from 'zod';

const civilDate = z.iso.date();
export const batchInputSchema = z
  .object({
    productId: z.uuid(),
    supplierId: z.uuid(),
    sourceCode: z.string().trim().min(1).max(120),
    quantity: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/)
      .refine((value) => Number(value) > 0 && Number(value) <= 1_000_000_000),
    expiryDate: civilDate,
    expiryOrigin: z.enum(['original', 'responsible']),
    originalExpiryDate: civilDate.nullable(),
    intentId: z.uuid(),
  })
  .refine((data) =>
    data.expiryOrigin === 'original'
      ? data.originalExpiryDate === data.expiryDate
      : !data.originalExpiryDate || data.expiryDate <= data.originalExpiryDate,
  );
export type BatchInput = z.infer<typeof batchInputSchema>;
export const batchRowSchema = z.object({
  id: z.uuid(),
  product_id: z.uuid(),
  source_code: z.string(),
  quantity: z.number(),
  unit: z.string(),
  expiry_date: civilDate,
  expiry_origin: z.enum(['original', 'responsible']),
  container_id: z.uuid().nullable(),
});
export type BatchRow = z.infer<typeof batchRowSchema>;
