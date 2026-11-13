import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ContainerGateway } from '../application/containerGateway';
import type { CatalogScope } from '../../catalog/domain/catalog';
import {
  CONTAINER_PAGE_SIZE,
  containerRowSchema,
  expirySummarySchema,
} from '../domain/container';

// Saldo, ordenação, filtro de esgotados, busca e paginação acontecem no servidor (list_containers,
// SECURITY INVOKER). Sem tetos no navegador: a tela lê uma página por vez.
export function createContainerGateway(
  client: SupabaseClient,
): ContainerGateway {
  async function assertAccess(scope: CatalogScope) {
    // Lista vazia por falta de vínculo não pode parecer "nenhum recipiente".
    const { data, error } = await client
      .from('establishments')
      .select('id')
      .eq('organization_id', scope.organizationId)
      .eq('id', scope.establishmentId)
      .maybeSingle();
    if (error || !data)
      throw new Error(
        'Acesso ao estabelecimento indisponível; a consulta não foi exibida.',
      );
  }
  return {
    async list(scope, query) {
      const { data, error } = await client.rpc('list_containers', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_filter: query.includeDepleted ? 'all' : 'with_balance',
        p_target_id: null,
        p_search: query.search.trim() || null,
        p_after_expiry: query.after?.expiryDate ?? null,
        p_after_id: query.after?.id ?? null,
        // Um a mais para saber se existe página seguinte.
        p_limit: CONTAINER_PAGE_SIZE + 1,
      });
      if (error) throw new Error('Não foi possível consultar os recipientes.');
      const rows = containerRowSchema.array().parse(data);
      await assertAccess(scope);
      const page = rows.slice(0, CONTAINER_PAGE_SIZE);
      const last = page.at(-1);
      return {
        rows: page,
        next:
          rows.length > CONTAINER_PAGE_SIZE && last
            ? { expiryDate: last.expiry_date, id: last.container_id }
            : null,
      };
    },
    async get(scope, containerId) {
      const { data, error } = await client.rpc('list_containers', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_filter: 'container',
        p_target_id: z.uuid().parse(containerId),
        p_search: null,
        p_after_expiry: null,
        p_after_id: null,
        p_limit: 1,
      });
      if (error) throw new Error('Não foi possível consultar o recipiente.');
      const rows = containerRowSchema.array().max(1).parse(data);
      return rows[0] ?? null;
    },
    async summary(scope, referenceDate) {
      const { data, error } = await client.rpc('container_expiry_summary', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_reference_date: z.iso.date().parse(referenceDate),
      });
      if (error) throw new Error('Não foi possível consultar as contagens.');
      const summary = expirySummarySchema.array().length(1).parse(data)[0];
      if (!summary) throw new Error('Contagens indisponíveis.');
      await assertAccess(scope);
      return summary;
    },
  };
}
