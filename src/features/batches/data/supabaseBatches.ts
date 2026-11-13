import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { BatchGateway } from '../application/batchGateway';
import { batchInputSchema, batchRowSchema } from '../domain/batch';

export function createBatchGateway(client: SupabaseClient): BatchGateway {
  return {
    async list(scope) {
      const all: ReturnType<typeof zBatchRows> = [];
      let cursor: string | null = null;
      for (;;) {
        let query = client
          .from('batch_receipts')
          .select(
            'id,product_id,source_code,quantity,unit,expiry_date,expiry_origin,containers(id),products!inner(name)',
          )
          .eq('organization_id', scope.organizationId)
          .eq('establishment_id', scope.establishmentId)
          // Fatia 6.1: o recebimento mostra o seu recipiente integral; derivados (6.3) ficam fora.
          .eq('containers.kind', 'integral')
          .order('id', { ascending: true });
        if (cursor) query = query.gt('id', cursor);
        const { data, error } = await query.limit(500);
        if (error)
          throw new Error('Não foi possível consultar todos os recebimentos.');
        const page = zBatchRows(data);
        all.push(...page);
        if (all.length > 10000)
          throw new Error(
            'O limite de 10.000 recebimentos foi excedido; a consulta não foi exibida.',
          );
        if (page.length < 500) break;
        const next = page.at(-1)?.id;
        if (!next || next === cursor)
          throw new Error('Não foi possível concluir a paginação.');
        cursor = next;
      }
      const { data: establishment, error: accessError } = await client
        .from('establishments')
        .select('id')
        .eq('organization_id', scope.organizationId)
        .eq('id', scope.establishmentId)
        .maybeSingle();
      if (accessError || !establishment)
        throw new Error(
          'Acesso ao estabelecimento indisponível; a consulta não foi exibida.',
        );
      return all.map(({ containers, products, ...row }) => {
        const container = Array.isArray(containers)
          ? containers[0]
          : containers;
        return {
          ...row,
          product_name: products.name,
          container_id: container?.id ?? null,
        };
      });
    },
    async receive(scope, input) {
      const v = batchInputSchema.parse(input);
      const { data, error } = await client.rpc('receive_batch', {
        p_organization_id: scope.organizationId,
        p_establishment_id: scope.establishmentId,
        p_product_id: v.productId,
        p_supplier_id: v.supplierId,
        p_source_code: v.sourceCode,
        p_quantity: v.quantity,
        p_expiry_date: v.expiryDate,
        p_expiry_origin: v.expiryOrigin,
        p_original_expiry_date: v.originalExpiryDate,
        p_intent_id: v.intentId,
      });
      if (error?.code === '23505')
        throw new Error('Esta tentativa já foi usada com outros dados.');
      if (error)
        throw new Error(
          'Não foi possível registrar o recebimento. Confira os dados e o acesso.',
        );
      return zUuid(data);
    },
  };
}

function zBatchRows(value: unknown) {
  return batchRowSchema
    .omit({ container_id: true })
    .extend({
      containers: z
        .union([
          z.object({ id: batchRowSchema.shape.container_id.unwrap() }),
          z
            .object({ id: batchRowSchema.shape.container_id.unwrap() })
            .array()
            .max(1),
        ])
        .nullable()
        .optional(),
      products: z.object({ name: z.string().min(1) }),
    })
    .array()
    .parse(value);
}
function zUuid(value: unknown): string {
  return batchRowSchema.shape.id.parse(value);
}
