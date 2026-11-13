import { vi } from 'vitest';
import type { ContainerGateway } from '../features/batches/application/containerGateway';
import {
  CONTAINER_PAGE_SIZE,
  type ContainerRow,
} from '../features/batches/domain/container';

// Servidor falso com a mesma regra de list_containers/container_expiry_summary (fatia 6.2):
// filtra esgotados, busca sem diferenciar maiúsculas, ordena por (validade, id) e pagina por cursor.
export function fakeContainers(rows: ContainerRow[]) {
  const sorted = () =>
    [...rows].sort((a, b) =>
      a.expiry_date === b.expiry_date
        ? a.container_id.localeCompare(b.container_id)
        : a.expiry_date.localeCompare(b.expiry_date),
    );
  const gateway = {
    list: vi.fn<ContainerGateway['list']>(async (_scope, query) => {
      const needle = query.search.trim().toLocaleLowerCase('pt-BR');
      const matches = sorted().filter(
        (row) =>
          (query.includeDepleted || row.balance > 0) &&
          (!needle ||
            [
              row.product_name,
              row.source_code,
              row.short_code,
              row.container_id,
            ]
              .join(' ')
              .toLocaleLowerCase('pt-BR')
              .includes(needle)) &&
          (!query.after ||
            row.expiry_date > query.after.expiryDate ||
            (row.expiry_date === query.after.expiryDate &&
              row.container_id > query.after.id)),
      );
      const page = matches.slice(0, CONTAINER_PAGE_SIZE);
      const last = page.at(-1);
      return {
        rows: page,
        next:
          matches.length > CONTAINER_PAGE_SIZE && last
            ? { expiryDate: last.expiry_date, id: last.container_id }
            : null,
      };
    }),
    get: vi.fn<ContainerGateway['get']>(
      async (_scope, id) => rows.find((row) => row.container_id === id) ?? null,
    ),
    summary: vi.fn<ContainerGateway['summary']>(async (_scope, reference) => {
      const tomorrow = new Date(`${reference}T00:00:00.000Z`);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const next = tomorrow.toISOString().slice(0, 10);
      const live = rows.filter((row) => row.balance > 0);
      return {
        overdue: live.filter((row) => row.expiry_date < reference).length,
        due_today: live.filter((row) => row.expiry_date === reference).length,
        due_tomorrow: live.filter((row) => row.expiry_date === next).length,
        later: live.filter((row) => row.expiry_date > next).length,
      };
    }),
  };
  return gateway satisfies ContainerGateway;
}

let sequence = 0;
export function containerRow(values: Partial<ContainerRow> = {}): ContainerRow {
  sequence += 1;
  const n = String(sequence).padStart(12, '0');
  return {
    container_id: `30000000-0000-4000-8000-${n}`,
    short_code: `C-${String(sequence).padStart(6, '0')}`,
    kind: 'integral',
    parent_container_id: null,
    batch_id: `20000000-0000-4000-8000-${n}`,
    product_id: '10000000-0000-4000-8000-000000000001',
    product_name: 'Arroz',
    unit: 'kg',
    source_code: `L${sequence}`,
    expiry_date: '2026-01-01',
    expiry_origin: 'receipt',
    batch_expiry_origin: 'original',
    initial_quantity: 1,
    balance: 1,
    timezone: 'America/Sao_Paulo',
    created_at: '2025-12-01T12:00:00Z',
    ...values,
  };
}
