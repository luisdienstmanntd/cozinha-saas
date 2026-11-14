import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { LocationGateway } from '../application/locationGateway';
import { LocationRejected } from '../application/locationGateway';
import {
  MISMATCH_MESSAGE,
  createLocationInputSchema,
  currentLocationSchema,
  knownLocationMessage,
  locationSchema,
  moveInputSchema,
} from '../domain/locations';

export function createLocationGateway(client: SupabaseClient): LocationGateway {
  const idsOf = (scope: CatalogScope) => ({
    p_organization_id: scope.organizationId,
    p_establishment_id: scope.establishmentId,
  });
  function refuse(error: { code?: string; message?: string }) {
    const known = knownLocationMessage(error.message);
    if (known)
      return new LocationRejected(known, false, known === MISMATCH_MESSAGE);
    if (error.code === '23505')
      return new LocationRejected(
        'Este identificador já foi usado com outros dados. Confira os locais antes de tentar de novo.',
        true,
      );
    if (error.code === '42501' || error.code === '23503')
      return new LocationRejected(
        'Operação recusada. Confira o seu acesso e atualize a tela.',
      );
    if (error.code === '22023')
      return new LocationRejected(
        'Dados recusados. Confira o local e a pessoa.',
      );
    return new Error('Não foi possível concluir. Tente de novo.');
  }
  return {
    async list(scope) {
      const { data, error } = await client
        .from('storage_locations')
        .select('id,name,condition,active')
        .eq('organization_id', scope.organizationId)
        .eq('establishment_id', scope.establishmentId)
        .order('name');
      if (error) throw new Error('Não foi possível carregar os locais.');
      return locationSchema.array().parse(data);
    },
    async currents(scope) {
      const { data, error } = await client.rpc(
        'list_container_locations',
        idsOf(scope),
      );
      if (error) throw new Error('Não foi possível carregar os locais.');
      return currentLocationSchema.array().parse(data);
    },
    async create(scope, input) {
      const parsed = createLocationInputSchema.parse(input);
      const { data, error } = await client.rpc('create_storage_location', {
        ...idsOf(scope),
        p_name: parsed.name,
        p_condition: parsed.condition,
        p_intent_id: parsed.intentId,
      });
      if (error) throw refuse(error);
      return z.uuid().parse(data);
    },
    async setActive(scope, locationId, active) {
      const { error } = await client.rpc('set_storage_location_active', {
        ...idsOf(scope),
        p_location_id: z.uuid().parse(locationId),
        p_active: active,
      });
      if (error) throw refuse(error);
    },
    async move(scope, input) {
      const parsed = moveInputSchema.parse(input);
      const { data, error } = await client.rpc('move_container', {
        ...idsOf(scope),
        p_container_id: parsed.containerId,
        p_location_id: parsed.locationId,
        p_handled_by: parsed.handledBy,
        p_intent_id: parsed.intentId,
        p_confirm_mismatch: parsed.confirmMismatch,
      });
      if (error) throw refuse(error);
      return z.uuid().parse(data);
    },
  };
}
