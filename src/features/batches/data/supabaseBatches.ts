import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { BatchGateway } from '../application/batchGateway';
import { batchInputSchema, batchRowSchema } from '../domain/batch';

export function createBatchGateway(client: SupabaseClient): BatchGateway {
  return {
    async list(scope) {
      const { data, error } = await client
        .from('batch_receipts')
        .select(
          'id,product_id,source_code,quantity,unit,expiry_date,expiry_origin,containers(id)',
        )
        .eq('organization_id', scope.organizationId)
        .eq('establishment_id', scope.establishmentId)
        .order('created_at', { ascending: false });
      if (error) throw new Error('Não foi possível consultar os recebimentos.');
      const rows = zBatchRows(data);
      return rows.map(({ containers, ...row }) => {
        const container = Array.isArray(containers)
          ? containers[0]
          : containers;
        return { ...row, container_id: container?.id ?? null };
      });
    },
    async receive(scope, input) {
      const v = batchInputSchema.parse(input);
      const { data, error } = await client.rpc('receive_batch', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_product_id: v.productId,
        p_supplier_id: v.supplierId,
        p_source_code: v.sourceCode,
        p_quantity: v.quantity,
        p_expiry_date: v.expiryDate,
        p_expiry_origin: v.expiryOrigin,
        p_original_expiry_date: v.originalExpiryDate,
        p_intent_id: v.intentId,
      });
      if (error?.code === '23505')
        throw new Error('Esta tentativa já foi usada com outros dados.');
      if (error)
        throw new Error(
          'Não foi possível registrar o recebimento. Confira os dados e o acesso.',
        );
      return zUuid(data);
    },
  };
}

function zBatchRows(value: unknown) {
  return batchRowSchema
    .omit({ container_id: true })
    .extend({
      containers: z
        .union([
          z.object({ id: batchRowSchema.shape.container_id.unwrap() }),
          z
            .object({ id: batchRowSchema.shape.container_id.unwrap() })
            .array()
            .max(1),
        ])
        .nullable()
        .optional(),
    })
    .array()
    .parse(value);
}
function zUuid(value: unknown): string {
  return batchRowSchema.shape.id.parse(value);
}
