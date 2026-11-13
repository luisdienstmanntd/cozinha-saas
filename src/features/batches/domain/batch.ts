import { z } from 'zod';
import { storageConditionSchema } from '../../catalog/domain/catalog';

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
    // Fatia 6.5b: conservação e situação da medição obrigatórias (D-041). O sistema registra a
    // temperatura e não a classifica.
    storageCondition: storageConditionSchema,
    temperatureStatus: z.enum(['measured', 'not_measured', 'not_required']),
    receivedTemperatureC: z
      .string()
      .regex(/^-?(?:0|[1-9]\d?)(?:\.\d)?$/)
      .refine((value) => Number(value) >= -50 && Number(value) <= 80)
      .nullable(),
    temperatureReason: z.string().trim().min(1).max(300).nullable(),
    intentId: z.uuid(),
  })
  .refine((data) =>
    data.expiryOrigin === 'original'
      ? data.originalExpiryDate === data.expiryDate
      : !data.originalExpiryDate || data.expiryDate <= data.originalExpiryDate,
  )
  .refine(
    (data) =>
      (data.storageCondition === 'ambient'
        ? data.temperatureStatus !== 'not_measured'
        : data.temperatureStatus !== 'not_required') &&
      (data.temperatureStatus === 'measured') ===
        (data.receivedTemperatureC !== null) &&
      (data.temperatureStatus === 'not_measured') ===
        (data.temperatureReason !== null),
    { message: 'temperature' },
  );
export type BatchInput = z.infer<typeof batchInputSchema>;
export const batchRowSchema = z.object({
  id: z.uuid(),
  product_id: z.uuid(),
  product_name: z.string().optional(),
  source_code: z.string(),
  quantity: z.number(),
  unit: z.string(),
  expiry_date: civilDate,
  expiry_origin: z.enum(['original', 'responsible']),
  container_id: z.uuid().nullable(),
});
export type BatchRow = z.infer<typeof batchRowSchema>;
