import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { OperationGateway } from '../application/operationGateway';

const rowSchema = z.object({
  kind: z.enum([
    'receipt',
    'handling',
    'handling_void',
    'decision',
    'movement',
    'location_move',
    'location',
  ]),
  id: z.uuid(),
  created_at: z.string(),
});

export function createOperationGateway(
  client: SupabaseClient,
): OperationGateway {
  return {
    async find(scope, intentId) {
      const { data, error } = await client.rpc('find_operation', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_intent_id: z.uuid().parse(intentId),
      });
      if (error)
        throw new Error('Não foi possível conferir o registro no servidor.');
      const rows = rowSchema.array().max(1).parse(data);
      const row = rows[0];
      return row
        ? { kind: row.kind, id: row.id, createdAt: row.created_at }
        : null;
    },
  };
}
