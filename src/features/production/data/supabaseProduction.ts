import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ProductionRejected } from '../application/productionGateway';
import type { ProductionGateway } from '../application/productionGateway';
import {
  knownProductionMessage,
  productionInputSchema,
  productionRowSchema,
  productionVoidInputSchema,
} from '../domain/production';

export const PRODUCTION_LIMIT = 50;

const listedSchema = z.object({
  batch_id: z.uuid(),
  produced_at: z.string(),
  late: z.boolean(),
  // Fatia 7.6; sempre presente no banco (as produções anteriores têm 120).
  late_window_minutes: z.number().int().optional(),
  handled_by_name: z.string(),
  note: z.string().nullable(),
  timezone: z.string(),
  batch_receipts: z.object({
    quantity: z.number(),
    unit: z.string(),
    expiry_date: z.iso.date(),
    products: z.object({ name: z.string() }),
    containers: z
      .object({
        id: z.uuid(),
        short_code: z.string(),
        kind: z.enum(['integral', 'derived']),
      })
      .array(),
  }),
  production_voids: z
    .union([
      z.object({ reason: z.string(), created_at: z.string() }),
      z.object({ reason: z.string(), created_at: z.string() }).array().max(1),
    ])
    .nullable(),
});

function refuse(
  error: { code?: string; message?: string },
  fallback: string,
): Error {
  const known = knownProductionMessage(error.message);
  if (known) return new ProductionRejected(known);
  if (error.code === '23505')
    return new ProductionRejected(
      'Este identificador já foi usado com outros dados. Confira as produções antes de tentar de novo.',
      true,
    );
  if (error.code === '42501' || error.code === '23503')
    return new ProductionRejected(
      'Operação recusada. Confira o seu acesso e atualize a tela.',
    );
  if (error.code === '22023' || error.code === '23514')
    return new ProductionRejected(fallback);
  // Sem código: conexão caiu ou resposta perdida. O resultado é incerto.
  return error.code
    ? new ProductionRejected(fallback)
    : new Error(
        'Não foi possível confirmar o registro. Repita a mesma tentativa; não crie outra sem conferir as produções.',
      );
}

export function createProductionGateway(
  client: SupabaseClient,
): ProductionGateway {
  return {
    async list(scope) {
      const { data, error } = await client
        .from('batch_productions')
        .select(
          'batch_id,produced_at,late,late_window_minutes,handled_by_name,note,timezone,batch_receipts!batch_productions_batch_fk!inner(quantity,unit,expiry_date,products!inner(name),containers(id,short_code,kind)),production_voids!production_voids_production_fk(reason,created_at)',
        )
        .eq('organization_id', scope.organizationId)
        .eq('establishment_id', scope.establishmentId)
        .order('produced_at', { ascending: false })
        .limit(PRODUCTION_LIMIT);
      if (error)
        throw new Error(
          'Não foi possível consultar as produções. Confira o acesso e tente novamente.',
        );
      return listedSchema
        .array()
        .parse(data)
        .map((row) => {
          const integral = row.batch_receipts.containers.find(
            (container) => container.kind === 'integral',
          );
          const voided = Array.isArray(row.production_voids)
            ? (row.production_voids[0] ?? null)
            : row.production_voids;
          return productionRowSchema.parse({
            batch_id: row.batch_id,
            product_name: row.batch_receipts.products.name,
            quantity: row.batch_receipts.quantity,
            unit: row.batch_receipts.unit,
            expiry_date: row.batch_receipts.expiry_date,
            produced_at: row.produced_at,
            late: row.late,
            late_window_minutes: row.late_window_minutes,
            handled_by_name: row.handled_by_name,
            note: row.note,
            timezone: row.timezone,
            container_id: integral?.id ?? null,
            short_code: integral?.short_code ?? null,
            voided,
          });
        });
    },
    async register(scope, input) {
      const v = productionInputSchema.parse(input);
      const { data, error } = await client.rpc('register_production', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_product_id: v.productId,
        p_quantity: v.quantity,
        p_expiry_date: v.expiryDate,
        p_produced_at: v.producedAt,
        p_handled_by: v.handledBy,
        p_note: v.note,
        p_late_reason: v.lateReason,
        p_intent_id: v.intentId,
      });
      if (error)
        throw refuse(
          error,
          'Não foi possível registrar a produção. Confira a preparação, a quantidade, o horário e a validade.',
        );
      return z.uuid().parse(data);
    },
    async void(scope, input) {
      const v = productionVoidInputSchema.parse(input);
      const { data, error } = await client.rpc('void_production', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_batch_id: v.batchId,
        p_reason: v.reason,
        p_intent_id: v.intentId,
      });
      if (error)
        throw refuse(
          error,
          'Não foi possível anular a produção. Atualize a lista e confira.',
        );
      return z.uuid().parse(data);
    },
  };
}
