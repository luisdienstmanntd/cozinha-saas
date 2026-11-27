import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogGateway } from '../application/catalogGateway';
import type { CatalogScope } from '../domain/catalog';
import {
  supplierRow,
  productRow,
  parseCatalogInput,
  parseStorageCondition,
  storageConditionSchema,
} from '../domain/catalog';
import { z } from 'zod';

const PRODUCT_COLUMNS =
  'id,name,unit,storage_condition,production_window_minutes';

async function assertEstablishmentAccess(
  client: SupabaseClient,
  scope: CatalogScope,
) {
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

export function createCatalogGateway(client: SupabaseClient): CatalogGateway {
  return {
    async list(kind, scope) {
      const product = kind !== 'suppliers';
      let query = client
        .from(product ? 'products' : 'suppliers')
        .select(product ? PRODUCT_COLUMNS : 'id,name,email,contact')
        .eq('organization_id', scope.organizationId)
        .eq('establishment_id', scope.establishmentId);
      // Fatia 7.1/7.3: preparações próprias (D-049) não entram no recebimento; têm lista própria.
      if (product)
        query = query.eq(
          'kind',
          kind === 'preparations' ? 'preparation' : 'product',
        );
      const { data, error } = await query.order('name');
      if (error)
        throw new Error(
          'Não foi possível consultar o catálogo. Confira seu acesso e tente novamente.',
        );
      const items = (product ? productRow : supplierRow).array().parse(data);
      // RLS também produz uma lista vazia quando o acesso à unidade não está ativo.
      if (items.length === 0) await assertEstablishmentAccess(client, scope);
      return items;
    },
    async create(kind, scope, input) {
      const product = kind !== 'suppliers';
      const { data, error } = await client
        .from(product ? 'products' : 'suppliers')
        .insert({
          ...parseCatalogInput(
            kind,
            input.name,
            input.unit,
            input.email,
            input.contact,
          ),
          // O tipo é escolhido só na criação (o cliente não tem UPDATE da coluna).
          ...(kind === 'preparations' ? { kind: 'preparation' } : {}),
          organization_id: scope.organizationId,
          establishment_id: scope.establishmentId,
        })
        .select(product ? PRODUCT_COLUMNS : 'id,name,email,contact')
        .single();
      if (error?.code === '23505')
        throw new Error('Esse nome já está cadastrado neste estabelecimento.');
      if (error)
        throw new Error(
          'Não foi possível cadastrar. Confira seu acesso e tente novamente.',
        );
      return (product ? productRow : supplierRow).parse(data);
    },
    async updateSupplier(scope, id, input) {
      const value = parseCatalogInput(
        'suppliers',
        input.name,
        null,
        input.email,
        input.contact,
      );
      const { data, error } = await client.rpc('edit_supplier', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_supplier_id: z.uuid().parse(id),
        p_name: value.name,
        p_email: value.email,
        p_contact: value.contact,
      });
      if (error?.code === '23505')
        throw new Error('Esse nome já está cadastrado neste estabelecimento.');
      if (error?.code === '22023')
        throw new Error(
          'O nome do fornecedor com recebimentos deve ser preservado. E-mail e contato podem ser atualizados.',
        );
      if (error)
        throw new Error(
          'Não foi possível salvar o fornecedor. Confira os dados e seu acesso.',
        );
      return supplierRow.parse(data);
    },
    async deleteSupplier(scope, id) {
      const { error } = await client.rpc('delete_supplier', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_supplier_id: z.uuid().parse(id),
      });
      if (error?.code === '23503')
        throw new Error(
          'Este fornecedor possui recebimentos e não pode ser excluído. O histórico foi preservado.',
        );
      if (error)
        throw new Error(
          'Não foi possível excluir o fornecedor. Atualize a lista e confira seu acesso.',
        );
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
    async setProductionWindow(scope, productId, minutes) {
      const value = z
        .number()
        .int()
        .min(15)
        .max(1440)
        .nullable()
        .parse(minutes);
      const { data, error } = await client.rpc('set_preparation_window', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_product_id: z.uuid().parse(productId),
        p_minutes: value,
      });
      if (error?.code === '22023' || error?.code === '23514')
        throw new Error(
          'A janela deve ficar entre 15 minutos e 24 horas, em minutos inteiros, e só vale para preparação própria.',
        );
      if (error?.code === '42501')
        throw new Error('Somente o proprietário muda a janela da preparação.');
      if (error)
        throw new Error(
          'Não foi possível salvar a janela. Atualize a lista e confira.',
        );
      return z.number().int().nullable().parse(data);
    },
  };
}
