import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { HandlingGateway } from '../application/handlingGateway';
import { HandlingRejected } from '../application/handlingGateway';
import {
  childRowSchema,
  contextSchema,
  handlingRowSchema,
  memberSchema,
  voidRowSchema,
} from '../domain/family';
import type {
  ContainerRef,
  Family,
  HandlingContext,
  OpeningInfo,
} from '../domain/family';
import { handlingInputSchema, voidInputSchema } from '../domain/handling';
import { knownMessage } from '../domain/messages';

const listedSchema = z.object({
  container_id: z.uuid(),
  short_code: z.string(),
  kind: z.enum(['integral', 'derived']),
  parent_container_id: z.uuid().nullable(),
  batch_id: z.uuid(),
  product_name: z.string(),
  unit: z.string(),
  source_code: z.string(),
  expiry_date: z.iso.date(),
  initial_quantity: z.number(),
  balance: z.number(),
  timezone: z.string(),
});
const blockSchema = z.object({ status: z.enum(['pending', 'rejected']) });
// list_containers aceita até 200 por chamada.
const FAMILY_LIMIT = 200;
const UNAVAILABLE = 'Recipiente indisponível ou sem acesso.';

export function createHandlingGateway(client: SupabaseClient): HandlingGateway {
  const idsOf = (scope: CatalogScope) => ({
    p_organization_id: scope.organizationId,
    p_establishment_id: scope.establishmentId,
  });
  async function listed(
    scope: CatalogScope,
    filter: 'container' | 'batch',
    target: string,
  ) {
    const { data, error } = await client.rpc('list_containers', {
      ...idsOf(scope),
      p_filter: filter,
      p_target_id: z.uuid().parse(target),
      p_search: null,
      p_after_expiry: null,
      p_after_id: null,
      p_limit: filter === 'batch' ? FAMILY_LIMIT : 1,
    });
    if (error) throw new Error(UNAVAILABLE);
    return listedSchema.array().parse(data);
  }
  function refuse(
    error: { code?: string; message?: string },
    fallback: string,
  ) {
    const known = knownMessage(error.message);
    if (known) return new HandlingRejected(known, false);
    if (error.code === '23505')
      return new HandlingRejected(
        'Este identificador já foi usado com outros dados. Confira os recipientes antes de tentar de novo.',
        true,
      );
    if (error.code === '42501' || error.code === '23503')
      return new HandlingRejected(
        'Operação recusada. Confira o seu acesso e atualize a tela.',
      );
    if (error.code === '22023')
      return new HandlingRejected(
        'Dados recusados. Confira as quantidades, as datas e a sobra.',
      );
    return new Error(fallback);
  }
  async function voidFor(scope: CatalogScope, handlingIds: string[]) {
    if (handlingIds.length === 0)
      return new Map<string, { reason: string; created_at: string }>();
    const { data, error } = await client
      .from('handling_voids')
      .select('handling_id,reason,created_at')
      .eq('organization_id', scope.organizationId)
      .in('handling_id', handlingIds);
    if (error) throw new Error(UNAVAILABLE);
    return new Map(
      voidRowSchema
        .array()
        .parse(data)
        .map((row) => [row.handling_id, row] as const),
    );
  }

  return {
    async context(scope, containerId) {
      const [row] = await listed(scope, 'container', containerId);
      if (!row) throw new Error(UNAVAILABLE);
      const stored = await client
        .from('containers')
        .select('storage')
        .eq('organization_id', scope.organizationId)
        .eq('id', row.container_id)
        .maybeSingle();
      if (stored.error || !stored.data) throw new Error(UNAVAILABLE);
      const blocks = await client.rpc('container_blocks', {
        ...idsOf(scope),
        p_container_id: row.container_id,
      });
      const rows = blockSchema.array().safeParse(blocks.data);
      if (blocks.error || !rows.success) throw new Error(UNAVAILABLE);
      const context = contextSchema.parse({
        ...row,
        storage: (stored.data as { storage: unknown }).storage ?? null,
      });
      const block: HandlingContext['block'] = rows.data.some(
        (b) => b.status === 'rejected',
      )
        ? 'rejected'
        : rows.data.length > 0
          ? 'pending'
          : null;
      return { ...context, block };
    },
    async members(scope) {
      const { data, error } = await client
        .from('memberships')
        .select('user_id,display_name,role')
        .eq('organization_id', scope.organizationId)
        .is('revoked_at', null);
      if (error) throw new Error('Não foi possível consultar as pessoas.');
      return memberSchema.array().parse(data);
    },
    async setDisplayName(scope, userId, name) {
      const { data, error } = await client.rpc('set_member_display_name', {
        p_organization_id: scope.organizationId,
        p_user_id: z.uuid().parse(userId),
        p_display_name: z.string().trim().min(1).max(40).parse(name),
      });
      if (error)
        throw new Error('Não foi possível definir o nome. Tente novamente.');
      return z.string().parse(data);
    },
    async handle(scope, input) {
      const v = handlingInputSchema.parse(input);
      const { data, error } = await client.rpc('handle_container', {
        ...idsOf(scope),
        p_source_container_id: v.sourceContainerId,
        p_kind: v.kind,
        p_quantities: v.quantities,
        p_expiry_date: v.expiryDate,
        p_storage: v.storage,
        p_handled_at: v.handledAt,
        p_handled_by: v.handledBy,
        p_remainder: v.remainder,
        p_remainder_reason: v.remainderReason,
        p_note: v.note,
        p_late_reason: v.lateReason,
        p_intent_id: v.intentId,
      });
      if (error)
        throw refuse(
          error,
          'Não foi possível confirmar o registro. Repita a mesma tentativa; não crie outra sem conferir os recipientes.',
        );
      return z.uuid().parse(data);
    },
    async created(scope, handlingId) {
      const handling = await client
        .from('container_handlings')
        .select(
          'id,source_container_id,kind,expiry_date,storage,handled_at,handled_by_name,remainder,remainder_quantity,timezone',
        )
        .eq('organization_id', scope.organizationId)
        .eq('id', z.uuid().parse(handlingId))
        .maybeSingle();
      if (handling.error || !handling.data) throw new Error(UNAVAILABLE);
      const info = handlingRowSchema.parse(handling.data);
      const children = await client
        .from('containers')
        .select('id,short_code,handling_id,position,initial_quantity')
        .eq('organization_id', scope.organizationId)
        .eq('handling_id', info.id)
        .order('position');
      if (children.error) throw new Error(UNAVAILABLE);
      const kids = childRowSchema.array().parse(children.data);
      const balances = await Promise.all(
        kids.map((kid) => listed(scope, 'container', kid.id)),
      );
      const voids = await voidFor(scope, [info.id]);
      return {
        handling: info,
        voided: voids.get(info.id) ?? null,
        children: kids.map((kid, index) => ({
          id: kid.id,
          short_code: kid.short_code,
          position: kid.position,
          initial_quantity: kid.initial_quantity,
          balance: balances[index]?.[0]?.balance ?? 0,
        })),
      } satisfies OpeningInfo;
    },
    async family(scope, containerId) {
      const [self] = await listed(scope, 'container', containerId);
      if (!self) throw new Error(UNAVAILABLE);
      const all = await listed(scope, 'batch', self.batch_id);
      const balanceOf = new Map(
        all.map((row) => [row.container_id, row.balance]),
      );
      const rows = await client
        .from('containers')
        .select(
          'id,short_code,handling_id,position,initial_quantity,parent_container_id',
        )
        .eq('organization_id', scope.organizationId)
        .eq('batch_id', self.batch_id)
        .limit(FAMILY_LIMIT);
      if (rows.error) throw new Error(UNAVAILABLE);
      const containers = childRowSchema
        .extend({ parent_container_id: z.uuid().nullable() })
        .array()
        .parse(rows.data);
      const me = containers.find((row) => row.id === self.container_id);
      const partial =
        containers.length >= FAMILY_LIMIT || all.length >= FAMILY_LIMIT;
      const handlingIds = new Set<string>();
      if (me?.handling_id) handlingIds.add(me.handling_id);
      const made = await client
        .from('container_handlings')
        .select(
          'id,source_container_id,kind,expiry_date,storage,handled_at,handled_by_name,remainder,remainder_quantity,timezone',
        )
        .eq('organization_id', scope.organizationId)
        .eq('batch_id', self.batch_id)
        .limit(FAMILY_LIMIT);
      if (made.error) throw new Error(UNAVAILABLE);
      const handlings = handlingRowSchema.array().parse(made.data);
      const voids = await voidFor(
        scope,
        handlings.map((h) => h.id),
      );
      const ref = (row: (typeof containers)[number]): ContainerRef => ({
        id: row.id,
        short_code: row.short_code,
        position: row.position,
        initial_quantity: row.initial_quantity,
        balance: balanceOf.get(row.id) ?? 0,
      });
      const openings = handlings
        .filter((h) => h.source_container_id === self.container_id)
        .sort((a, b) => a.handled_at.localeCompare(b.handled_at))
        .map((handling) => ({
          handling,
          voided: voids.get(handling.id) ?? null,
          children: containers
            .filter((row) => row.handling_id === handling.id)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map(ref),
        }));
      const own = handlings.find((h) => h.id === me?.handling_id);
      const parent = containers.find(
        (row) => row.id === me?.parent_container_id,
      );
      const created: Family['created'] = own
        ? {
            handling: own,
            voided: voids.get(own.id) ?? null,
            parent: parent
              ? { id: parent.id, short_code: parent.short_code }
              : null,
            position: me?.position ?? null,
            siblings: containers.filter((row) => row.handling_id === own.id)
              .length,
          }
        : null;
      return { created, openings, partial };
    },
    async void(scope, input) {
      const v = voidInputSchema.parse(input);
      const { data, error } = await client.rpc('void_handling', {
        ...idsOf(scope),
        p_handling_id: v.handlingId,
        p_reason: v.reason,
        p_intent_id: v.intentId,
      });
      if (error)
        throw refuse(
          error,
          'Não foi possível confirmar a anulação. Repita a mesma tentativa.',
        );
      return z.uuid().parse(data);
    },
  };
}
