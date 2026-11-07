import type { SupabaseClient } from '@supabase/supabase-js';
import type { LabelGateway } from '../application/labelGateway';
import { labelDataSchema } from '../domain/label';

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
          'id,batch_receipts!inner(source_code,quantity,unit,expiry_date,expiry_origin,products!inner(name))',
        )
        .eq('id', id)
        .maybeSingle();
      if (error || !data)
        throw new Error('Recipiente indisponível ou sem acesso.');
      return labelDataSchema.parse(data);
    },
  };
}
