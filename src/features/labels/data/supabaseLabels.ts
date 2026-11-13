import type { SupabaseClient } from '@supabase/supabase-js';
import type { LabelGateway } from '../application/labelGateway';
import { z } from 'zod';
import { labelDataSchema } from '../domain/label';

const scopeSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  establishment_id: z.uuid(),
});
const balanceSchema = z.object({ container_id: z.uuid(), balance: z.number() });

export function createLabelGateway(client: SupabaseClient): LabelGateway {
  return {
    async ensure(scope, batchId) {
      const { data, error } = await client.rpc('ensure_container', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_batch_id: batchId,
      });
      if (error)
        throw new Error(
          'Não foi possível preparar o recipiente. Confira seu acesso.',
        );
      return labelDataSchema.shape.id.parse(data);
    },
    async get(id) {
      const { data, error } = await client
        .from('containers')
        .select(
          'id,organization_id,establishment_id,short_code,batch_receipts!inner(source_code,quantity,unit,expiry_date,expiry_origin,products!inner(name))',
        )
        .eq('id', id)
        .maybeSingle();
      if (error || !data)
        throw new Error('Recipiente indisponível ou sem acesso.');
      const scope = scopeSchema.parse(data);
      // O saldo vem do servidor, pelo escopo do próprio recipiente; a RLS continua sendo a barreira.
      const balance = await client.rpc('list_containers', {
        p_organization_id: scope.organization_id,
        p_establishment_id: scope.establishment_id,
        p_filter: 'container',
        p_target_id: scope.id,
        p_search: null,
        p_after_expiry: null,
        p_after_id: null,
        p_limit: 1,
      });
      const row = balanceSchema.array().max(1).safeParse(balance.data);
      if (balance.error || !row.success || !row.data[0])
        throw new Error('Recipiente indisponível ou sem acesso.');
      return labelDataSchema.parse({
        id: scope.id,
        short_code: (data as { short_code: unknown }).short_code,
        balance: row.data[0].balance,
        batch_receipts: (data as { batch_receipts: unknown }).batch_receipts,
      });
    },
  };
}
