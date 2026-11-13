import type { SupabaseClient } from '@supabase/supabase-js';
import type { LabelGateway } from '../application/labelGateway';
import { z } from 'zod';
import { labelDataSchema } from '../domain/label';

const scopeSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  establishment_id: z.uuid(),
});
const balanceSchema = z.object({ container_id: z.uuid(), balance: z.number() });
const blockSchema = z.object({ kind: z.string(), status: z.string() });

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
          'id,organization_id,establishment_id,short_code,handling_id,batch_receipts!inner(source_code,quantity,unit,expiry_date,expiry_origin,products!inner(name))',
        )
        .eq('id', id)
        .maybeSingle();
      if (error || !data)
        throw new Error('Recipiente indisponível ou sem acesso.');
      const scope = scopeSchema.parse(data);
      // O saldo vem do servidor, pelo escopo do próprio recipiente; a RLS continua sendo a barreira.
      const balance = await client.rpc('list_containers', {
        p_organization_id: scope.organization_id,
        p_establishment_id: scope.establishment_id,
        p_filter: 'container',
        p_target_id: scope.id,
        p_search: null,
        p_after_expiry: null,
        p_after_id: null,
        p_limit: 1,
      });
      const row = balanceSchema.array().max(1).safeParse(balance.data);
      if (balance.error || !row.success || !row.data[0])
        throw new Error('Recipiente indisponível ou sem acesso.');
      // Derivado de manipulação anulada: a anulação é lida pela RLS, como o resto.
      const handlingId = z
        .uuid()
        .nullable()
        .catch(null)
        .parse((data as { handling_id?: unknown }).handling_id ?? null);
      let voided = false;
      if (handlingId) {
        const found = await client
          .from('handling_voids')
          .select('id')
          .eq('handling_id', handlingId)
          .maybeSingle();
        if (found.error)
          throw new Error('Recipiente indisponível ou sem acesso.');
        voided = found.data !== null;
      }
      // Fatia 6.5a: derivado de manipulação registrada fora da janela, sem liberação do proprietário.
      // O bloqueio vem do banco (container_blocks), pela RLS, como o resto. Desde a 6.5b a consulta vale
      // para todo recipiente não anulado (recebimento sem medição bloqueia o integral).
      let lateHold = false;
      let hold: 'pending' | 'rejected' | null = null;
      if (!voided) {
        const blocks = await client.rpc('container_blocks', {
          p_organization_id: scope.organization_id,
          p_establishment_id: scope.establishment_id,
          p_container_id: scope.id,
        });
        const rows = blockSchema.array().safeParse(blocks.data);
        if (blocks.error || !rows.success)
          throw new Error('Recipiente indisponível ou sem acesso.');
        lateHold = rows.data.some((row) => row.kind === 'late_handling');
        // Fatia 6.5b: integral ou derivado bloqueado; rejeitada prevalece sobre aguardando decisão.
        hold = rows.data.some((row) => row.status === 'rejected')
          ? 'rejected'
          : rows.data.length > 0
            ? 'pending'
            : null;
      }
      return labelDataSchema.parse({
        id: scope.id,
        voided,
        late_hold: lateHold,
        hold,
        short_code: (data as { short_code: unknown }).short_code,
        balance: row.data[0].balance,
        batch_receipts: (data as { batch_receipts: unknown }).batch_receipts,
      });
    },
  };
}
