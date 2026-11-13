import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { OccurrenceGateway } from '../application/occurrenceGateway';
import { DecisionRejected } from '../application/occurrenceGateway';
import {
  decisionInputSchema,
  OCCURRENCE_LIMIT,
  occurrenceRowSchema,
} from '../domain/occurrence';

export function createOccurrenceGateway(
  client: SupabaseClient,
): OccurrenceGateway {
  return {
    async list(scope, filter) {
      const { data, error } = await client.rpc('list_occurrences', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_scope: filter,
        p_limit: OCCURRENCE_LIMIT,
      });
      if (error) throw new Error('Não foi possível consultar as ocorrências.');
      const rows = occurrenceRowSchema.array().parse(data);
      // Lista vazia por falta de vínculo não pode parecer "nenhuma ocorrência".
      const access = await client
        .from('establishments')
        .select('id')
        .eq('organization_id', scope.organizationId)
        .eq('id', scope.establishmentId)
        .maybeSingle();
      if (access.error || !access.data)
        throw new Error(
          'Acesso ao estabelecimento indisponível; a consulta não foi exibida.',
        );
      return rows;
    },
    async decide(scope, input) {
      const v = decisionInputSchema.parse(input);
      const { data, error } = await client.rpc('decide_occurrence', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_occurrence_id: v.occurrenceId,
        p_decision: v.decision,
        p_reason: v.reason,
        p_intent_id: v.intentId,
      });
      if (error?.code === '23505')
        throw new DecisionRejected(
          'Esta ocorrência já foi decidida. Atualize a lista para ver a decisão registrada.',
        );
      if (
        error?.code === '22023' ||
        error?.code === '42501' ||
        error?.code === '23503'
      )
        throw new DecisionRejected(
          'Decisão recusada. Confira a justificativa e o seu acesso.',
        );
      if (error)
        throw new Error(
          'Não foi possível confirmar a decisão. Repita a mesma tentativa.',
        );
      return z.uuid().parse(data);
    },
  };
}
