import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogGateway } from '../application/catalogGateway';
import {
  catalogRow,
  productRow,
  parseCatalogInput,
  parseStorageCondition,
  storageConditionSchema,
} from '../domain/catalog';
import { z } from 'zod';

const PRODUCT_COLUMNS = 'id,name,unit,storage_condition';

export function createCatalogGateway(client: SupabaseClient): CatalogGateway {
  return {
    async list(kind, scope) {
      const product = kind === 'products';
      const { data, error } = await client
        .from(kind)
        .select(product ? PRODUCT_COLUMNS : 'id,name')
        .eq('organization_id', scope.organizationId)
        .eq('establishment_id', scope.establishmentId)
        .order('name');
      if (error)
        throw new Error(
          'Não foi possível consultar o catálogo. Confira seu acesso e tente novamente.',
        );
      return (product ? productRow : catalogRow).array().parse(data);
    },
    async create(kind, scope, input) {
      const product = kind === 'products';
      const { data, error } = await client
        .from(kind)
        .insert({
          ...parseCatalogInput(kind, input.name, input.unit),
          organization_id: scope.organizationId,
          establishment_id: scope.establishmentId,
        })
        .select(product ? PRODUCT_COLUMNS : 'id,name')
        .single();
      if (error?.code === '23505')
        throw new Error('Esse nome já está cadastrado neste estabelecimento.');
      if (error)
        throw new Error(
          'Não foi possível cadastrar. Confira seu acesso e tente novamente.',
        );
      return (product ? productRow : catalogRow).parse(data);
    },
    async setStorageCondition(scope, productId, condition) {
      const { data, error } = await client.rpc(
        'set_product_storage_condition',
        {
          p_organization_id: scope.organizationId,
          p_establishment_id: scope.establishmentId,
          p_product_id: z.uuid().parse(productId),
          p_storage_condition: parseStorageCondition(condition),
        },
      );
      if (error?.code === '22023')
        throw new Error(
          'A conservação deste produto já foi definida e não pode ser trocada. Atualize a lista.',
        );
      if (error)
        throw new Error(
          'Não foi possível definir a conservação. Confira seu acesso e tente novamente.',
        );
      return storageConditionSchema.parse(data);
    },
  };
}
