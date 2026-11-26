import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetricsGateway } from '../application/metricsGateway';
import { metricsSchema } from '../domain/metrics';

export function createMetricsGateway(client: SupabaseClient): MetricsGateway {
  return {
    async read(scope, period) {
      const { data, error } = await client.rpc('pilot_metrics', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_from: period.from.toISOString(),
        p_to: period.to.toISOString(),
      });
      if (error)
        throw new Error(
          'Não foi possível consultar os indicadores da unidade.',
        );
      const row = Array.isArray(data) ? (data as unknown[])[0] : data;
      return metricsSchema.parse(row);
    },
  };
}
