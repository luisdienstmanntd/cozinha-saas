import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogGateway } from '../application/catalogGateway';
import { catalogRow, productRow, parseCatalogInput } from '../domain/catalog';

export function createCatalogGateway(client: SupabaseClient): CatalogGateway {
  return {
    async list(kind, scope) {
      const product = kind === 'products';
      const { data, error } = await client
        .from(kind)
        .select(product ? 'id,name,unit' : 'id,name')
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
        .select(product ? 'id,name,unit' : 'id,name')
        .single();
      if (error?.code === '23505')
        throw new Error('Esse nome já está cadastrado neste estabelecimento.');
      if (error)
        throw new Error(
          'Não foi possível cadastrar. Confira seu acesso e tente novamente.',
        );
      return (product ? productRow : catalogRow).parse(data);
    },
  };
}
