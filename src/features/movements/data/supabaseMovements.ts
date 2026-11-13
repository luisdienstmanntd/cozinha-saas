import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { MovementGateway } from '../application/movementGateway';
import { MovementRejected } from '../application/movementGateway';
const movementSchema = z.object({
  id: z.uuid(),
  // Fatia 6.3: 'transfer' é a saída da origem para os recipientes derivados de uma manipulação.
  // Fatia 6.4: 'transfer_reversal' (devolução na origem) e 'handling_void' (saída do derivado) vêm
  // da anulação de uma manipulação.
  kind: z.enum([
    'consumption',
    'discard',
    'reversal',
    'transfer',
    'transfer_reversal',
    'handling_void',
  ]),
  quantity: z.number(),
  reason: z.string().nullable(),
  created_by: z.uuid(),
  created_at: z.string(),
  timezone: z.string(),
  reverses_id: z.uuid().nullable(),
  handling_id: z.uuid().nullable(),
});
export function createMovementGateway(client: SupabaseClient): MovementGateway {
  return {
    async list(scope, batchId) {
      const { data, error, count } = await client
        .from('stock_movements')
        .select(
          'id,kind,quantity,reason,created_by,created_at,timezone,reverses_id,handling_id,containers!inner(kind)',
          {
            count: 'exact',
          },
        )
        .eq('organization_id', scope.organizationId)
        .eq('establishment_id', scope.establishmentId)
        .eq('batch_id', batchId)
        // Fatia 6.1: o saldo exibido é o do recipiente integral (o recebimento inteiro na tela atual).
        .eq('containers.kind', 'integral')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1000);
      if (error) throw new Error('Histórico indisponível.');
      const rows = movementSchema
        .array()
        .parse(data)
        .map(({ handling_id, ...row }) => ({
          ...row,
          handlingId: handling_id,
        }));
      if (count === null || count !== rows.length)
        throw new Error('O histórico excede o limite de 1.000 eventos.');
      const access = await client
        .from('establishments')
        .select('id')
        .eq('organization_id', scope.organizationId)
        .eq('id', scope.establishmentId)
        .maybeSingle();
      if (access.error || !access.data) throw new Error('Acesso indisponível.');
      return rows;
    },
    async record(scope, input) {
      if (input.kind === 'reversal') {
        const target = z.uuid().parse(input.targetId);
        const { data, error } = await client.rpc('reverse_movement', {
          p_organization_id: scope.organizationId,
          p_establishment_id: scope.establishmentId,
          p_movement_id: target,
          p_reason: input.reason,
          p_intent_id: input.intentId,
        });
        if (error?.code === '22023' || error?.code === '23505')
          throw new MovementRejected('Anulação recusada.');
        if (error) throw new Error('Não foi possível confirmar a anulação.');
        return z.uuid().parse(data);
      }
      const { data, error } = await client.rpc('record_movement', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_batch_id: input.batchId,
        p_kind: input.kind,
        p_quantity: input.quantity,
        p_reason: input.reason,
        p_intent_id: input.intentId,
      });
      if (error?.code === '22023')
        throw new MovementRejected('Saída recusada.');
      if (error) throw new Error('Não foi possível confirmar a saída.');
      return z.uuid().parse(data);
    },
  };
}
