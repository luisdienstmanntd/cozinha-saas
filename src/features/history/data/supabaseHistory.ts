import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { formatCivilDate } from '../../../shared/format/dates';
import type { HistoryGateway } from '../application/historyGateway';
import {
  NO_ACTOR,
  quantityWithUnit,
  registryTitle,
  registryValue,
  sortEvents,
  type HistoryEvent,
} from '../domain/history';

// D-079: lê, sem escrever, os registros que o banco já guarda e os junta em uma linha do tempo. Cada
// tipo vem de uma consulta com o limite abaixo (a mais recente primeiro); passando dele, a tela avisa.
// Nomes de produto, fornecedor, recipiente, local e pessoa vêm de consultas por identificador, na mesma
// unidade, para não depender de relação embutida entre tabelas.
export const SOURCE_LIMIT = 500;
const CHUNK = 100;

const id = z.uuid();
const instant = z.string();
const text = z.string().nullable();

const receiptSchema = z.object({
  id,
  product_id: id,
  supplier_id: id.nullable(),
  quantity: z.union([z.string(), z.number()]),
  unit: z.string(),
  expiry_date: z.string(),
  created_by: id,
  created_at: instant,
});
const movementSchema = z.object({
  id,
  batch_id: id,
  container_id: id.nullable(),
  kind: z.string(),
  quantity: z.union([z.string(), z.number()]),
  reason: text,
  created_by: id,
  created_at: instant,
});
const handlingSchema = z.object({
  id,
  batch_id: id,
  source_container_id: id,
  kind: z.string(),
  portion_count: z.number(),
  total_quantity: z.union([z.string(), z.number()]),
  note: text,
  handled_by_name: z.string(),
  created_at: instant,
});
const handlingVoidSchema = z.object({
  id,
  batch_id: id,
  reason: z.string(),
  created_by: id,
  created_at: instant,
});
const moveSchema = z.object({
  id,
  container_id: id,
  from_location_id: id.nullable(),
  to_location_id: id,
  handled_by_name: z.string(),
  created_at: instant,
});
const occurrenceSchema = z.object({
  id,
  batch_id: id,
  kind: z.string(),
  reason: z.string(),
  created_by: id,
  created_at: instant,
});
const decisionSchema = z.object({
  id,
  batch_id: id,
  decision: z.string(),
  reason: z.string(),
  created_by: id,
  created_at: instant,
});
const productionSchema = z.object({
  id,
  batch_id: id,
  produced_at: instant,
  late: z.boolean(),
  handled_by_name: z.string(),
  note: text,
  created_at: instant,
});
const productionVoidSchema = z.object({
  id,
  batch_id: id,
  reason: z.string(),
  created_by: id,
  created_at: instant,
});
const registrySchema = z.object({
  id,
  entity: z.string(),
  entity_id: id,
  field: z.string(),
  old_value: text,
  new_value: text,
  changed_by: id.nullable(),
  changed_at: instant,
});

const batchSchema = z.object({
  id,
  product_id: id,
  quantity: z.union([z.string(), z.number()]),
  unit: z.string(),
});
const named = z.object({ id, name: z.string() });
const containerSchema = z.object({ id, short_code: z.string() });
const memberSchema = z.object({
  user_id: id,
  display_name: z.string().nullable(),
});

function unique<T>(values: Iterable<T | null | undefined>): T[] {
  return [...new Set([...values].filter((v): v is T => v != null))];
}
function chunks<T>(values: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += CHUNK)
    out.push(values.slice(i, i + CHUNK));
  return out;
}

export function createHistoryGateway(client: SupabaseClient): HistoryGateway {
  return {
    async read(scope, period) {
      const from = period.from.toISOString();
      const to = period.to.toISOString();
      const scoped = (table: string, columns: string) =>
        client
          .from(table)
          .select(columns)
          .eq('organization_id', scope.organizationId)
          .eq('establishment_id', scope.establishmentId);
      const recent = (table: string, columns: string, column = 'created_at') =>
        scoped(table, columns)
          .gte(column, from)
          .lt(column, to)
          .order(column, { ascending: false })
          .limit(SOURCE_LIMIT);
      const failed = () =>
        new Error('Não foi possível consultar o histórico da unidade.');

      const [
        receipts,
        movements,
        handlings,
        handlingVoids,
        moves,
        occurrences,
        decisions,
        productions,
        productionVoids,
        registry,
        members,
      ] = await Promise.all([
        recent(
          'batch_receipts',
          'id,product_id,supplier_id,quantity,unit,expiry_date,created_by,created_at',
        ).eq('origin', 'received'),
        recent(
          'stock_movements',
          'id,batch_id,container_id,kind,quantity,reason,created_by,created_at',
        ).in('kind', ['consumption', 'discard', 'reversal']),
        recent(
          'container_handlings',
          'id,batch_id,source_container_id,kind,portion_count,total_quantity,note,handled_by_name,created_at',
        ),
        recent('handling_voids', 'id,batch_id,reason,created_by,created_at'),
        recent(
          'location_moves',
          'id,container_id,from_location_id,to_location_id,handled_by_name,created_at',
        ).eq('kind', 'move'),
        recent('occurrences', 'id,batch_id,kind,reason,created_by,created_at'),
        recent(
          'occurrence_decisions',
          'id,batch_id,decision,reason,created_by,created_at',
        ),
        recent(
          'batch_productions',
          'id,batch_id,produced_at,late,handled_by_name,note,created_at',
        ),
        recent('production_voids', 'id,batch_id,reason,created_by,created_at'),
        client
          .from('entity_changes')
          .select(
            'id,entity,entity_id,field,old_value,new_value,changed_by,changed_at',
          )
          .eq('organization_id', scope.organizationId)
          .or(
            `establishment_id.is.null,establishment_id.eq.${scope.establishmentId}`,
          )
          .gte('changed_at', from)
          .lt('changed_at', to)
          .order('changed_at', { ascending: false })
          .limit(SOURCE_LIMIT),
        client
          .from('memberships')
          .select('user_id,display_name')
          .eq('organization_id', scope.organizationId),
      ]);
      for (const result of [
        receipts,
        movements,
        handlings,
        handlingVoids,
        moves,
        occurrences,
        decisions,
        productions,
        productionVoids,
        registry,
        members,
      ])
        if (result.error) throw failed();

      const rows = {
        receipts: receiptSchema.array().parse(receipts.data),
        movements: movementSchema.array().parse(movements.data),
        handlings: handlingSchema.array().parse(handlings.data),
        handlingVoids: handlingVoidSchema.array().parse(handlingVoids.data),
        moves: moveSchema.array().parse(moves.data),
        occurrences: occurrenceSchema.array().parse(occurrences.data),
        decisions: decisionSchema.array().parse(decisions.data),
        productions: productionSchema.array().parse(productions.data),
        productionVoids: productionVoidSchema
          .array()
          .parse(productionVoids.data),
        registry: registrySchema.array().parse(registry.data),
      };
      const truncated = Object.values(rows).some(
        (list) => list.length >= SOURCE_LIMIT,
      );

      // Consultas por identificador (lotes, produtos, fornecedores, recipientes, locais).
      async function byIds<S extends z.ZodType>(
        table: string,
        columns: string,
        schema: S,
        ids: string[],
        scopedToUnit = true,
      ): Promise<z.infer<S>[]> {
        const found: z.infer<S>[] = [];
        for (const part of chunks(ids)) {
          let query = client
            .from(table)
            .select(columns)
            .eq('organization_id', scope.organizationId);
          if (scopedToUnit)
            query = query.eq('establishment_id', scope.establishmentId);
          const { data, error } = await query.in('id', part);
          if (error) throw failed();
          found.push(...schema.array().parse(data));
        }
        return found;
      }

      const batchIds = unique([
        ...rows.movements.map((r) => r.batch_id),
        ...rows.handlings.map((r) => r.batch_id),
        ...rows.handlingVoids.map((r) => r.batch_id),
        ...rows.occurrences.map((r) => r.batch_id),
        ...rows.decisions.map((r) => r.batch_id),
        ...rows.productions.map((r) => r.batch_id),
        ...rows.productionVoids.map((r) => r.batch_id),
      ]);
      const containerIds = unique([
        ...rows.movements.map((r) => r.container_id),
        ...rows.handlings.map((r) => r.source_container_id),
        ...rows.moves.map((r) => r.container_id),
      ]);
      const locationIds = unique(
        rows.moves.flatMap((r) => [r.from_location_id, r.to_location_id]),
      );
      const [batchRows, containerRows, locationRows] = await Promise.all([
        byIds(
          'batch_receipts',
          'id,product_id,quantity,unit',
          batchSchema,
          batchIds,
        ),
        byIds('containers', 'id,short_code', containerSchema, containerIds),
        byIds('storage_locations', 'id,name', named, locationIds),
      ]);
      const batches = new Map(batchRows.map((b) => [b.id, b]));
      const productIds = unique([
        ...rows.receipts.map((r) => r.product_id),
        ...rows.registry
          .filter((r) => r.entity === 'product')
          .map((r) => r.entity_id),
        ...batchRows.map((b) => b.product_id),
      ]);
      const supplierIds = unique(rows.receipts.map((r) => r.supplier_id));
      const [productRows, supplierRows] = await Promise.all([
        byIds('products', 'id,name', named, productIds),
        byIds('suppliers', 'id,name', named, supplierIds),
      ]);
      const products = new Map(productRows.map((p) => [p.id, p.name]));
      const suppliers = new Map(supplierRows.map((s) => [s.id, s.name]));
      const containers = new Map(
        containerRows.map((c) => [c.id, c.short_code]),
      );
      const locations = new Map(locationRows.map((l) => [l.id, l.name]));
      const people = new Map(
        memberSchema
          .array()
          .parse(members.data)
          .map((m) => [m.user_id, m.display_name]),
      );
      const who = (userId: string | null) =>
        (userId ? people.get(userId) : null) ?? NO_ACTOR;
      const productOfBatch = (batchId: string) => {
        const batch = batches.get(batchId);
        return batch ? (products.get(batch.product_id) ?? null) : null;
      };

      const events: HistoryEvent[] = [];
      const base = (
        event: Pick<HistoryEvent, 'id' | 'at' | 'group' | 'title'> &
          Partial<HistoryEvent>,
      ) =>
        events.push({
          product: null,
          container: null,
          quantity: null,
          detail: null,
          reason: null,
          actor: null,
          ...event,
        });

      for (const r of rows.receipts) {
        const supplier = r.supplier_id ? suppliers.get(r.supplier_id) : null;
        base({
          id: `receipt:${r.id}`,
          at: r.created_at,
          group: 'receipts',
          title: 'Recebimento',
          product: products.get(r.product_id) ?? null,
          quantity: quantityWithUnit(r.quantity, r.unit),
          detail: [
            supplier ? `Fornecedor: ${supplier}` : null,
            `Validade: ${formatCivilDate(r.expiry_date)}`,
          ]
            .filter(Boolean)
            .join(' · '),
          actor: who(r.created_by),
        });
      }
      for (const r of rows.movements) {
        const batch = batches.get(r.batch_id);
        const title =
          r.kind === 'consumption'
            ? 'Consumo'
            : r.kind === 'discard'
              ? 'Descarte'
              : 'Saída anulada';
        base({
          id: `movement:${r.id}`,
          at: r.created_at,
          group: 'exits',
          title,
          product: productOfBatch(r.batch_id),
          container: r.container_id
            ? (containers.get(r.container_id) ?? null)
            : null,
          quantity: batch ? quantityWithUnit(r.quantity, batch.unit) : null,
          reason: r.reason,
          actor: who(r.created_by),
        });
      }
      for (const r of rows.handlings)
        base({
          id: `handling:${r.id}`,
          at: r.created_at,
          group: 'handlings',
          title:
            r.kind === 'opening'
              ? 'Produto aberto'
              : `Porcionamento (${r.portion_count} porções)`,
          product: productOfBatch(r.batch_id),
          container: containers.get(r.source_container_id) ?? null,
          quantity: batches.get(r.batch_id)
            ? quantityWithUnit(r.total_quantity, batches.get(r.batch_id)!.unit)
            : null,
          reason: r.note,
          actor: r.handled_by_name,
        });
      for (const r of rows.handlingVoids)
        base({
          id: `handling-void:${r.id}`,
          at: r.created_at,
          group: 'handlings',
          title: 'Manipulação anulada',
          product: productOfBatch(r.batch_id),
          reason: r.reason,
          actor: who(r.created_by),
        });
      for (const r of rows.moves)
        base({
          id: `move:${r.id}`,
          at: r.created_at,
          group: 'locations',
          title: 'Mudança de local',
          container: containers.get(r.container_id) ?? null,
          detail: r.from_location_id
            ? `De ${locations.get(r.from_location_id) ?? 'outro local'} para ${locations.get(r.to_location_id) ?? 'outro local'}`
            : `Colocado em ${locations.get(r.to_location_id) ?? 'um local'}`,
          actor: r.handled_by_name,
        });
      for (const r of rows.occurrences)
        base({
          id: `occurrence:${r.id}`,
          at: r.created_at,
          group: 'occurrences',
          title:
            r.kind === 'temperature_not_measured'
              ? 'Ocorrência: temperatura não medida'
              : 'Ocorrência: manipulação fora do prazo',
          product: productOfBatch(r.batch_id),
          reason: r.reason,
          actor: who(r.created_by),
        });
      for (const r of rows.decisions)
        base({
          id: `decision:${r.id}`,
          at: r.created_at,
          group: 'occurrences',
          title: `Decisão: ${r.decision === 'released' ? 'liberado' : 'recusado'}`,
          product: productOfBatch(r.batch_id),
          reason: r.reason,
          actor: who(r.created_by),
        });
      for (const r of rows.productions) {
        const batch = batches.get(r.batch_id);
        base({
          id: `production:${r.id}`,
          at: r.created_at,
          group: 'productions',
          title: 'Produção registrada',
          product: productOfBatch(r.batch_id),
          quantity: batch ? quantityWithUnit(batch.quantity, batch.unit) : null,
          detail: r.late ? 'Registro fora da janela' : null,
          reason: r.note,
          actor: r.handled_by_name,
        });
      }
      for (const r of rows.productionVoids)
        base({
          id: `production-void:${r.id}`,
          at: r.created_at,
          group: 'productions',
          title: 'Produção anulada',
          product: productOfBatch(r.batch_id),
          reason: r.reason,
          actor: who(r.created_by),
        });
      for (const r of rows.registry)
        base({
          id: `registry:${r.id}`,
          at: r.changed_at,
          group: 'registry',
          title: registryTitle(r.entity, r.field),
          product:
            r.entity === 'product' ? (products.get(r.entity_id) ?? null) : null,
          detail: `${registryValue(r.field, r.old_value)} → ${registryValue(r.field, r.new_value)}`,
          actor: r.changed_by ? who(r.changed_by) : 'Administração do sistema',
        });

      return { events: sortEvents(events), truncated };
    },
  };
}
