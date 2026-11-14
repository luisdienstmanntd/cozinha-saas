import { expect, it } from 'vitest';
import { kindLabels, occurrenceRowSchema } from './occurrence';
import { containerRowSchema } from '../../batches/domain/container';

const uuid = '12345678-1234-4234-8234-123456789abc';

it('lê a ocorrência de produção tardia de lote sem código de lote (fatia 7.1)', () => {
  const row = occurrenceRowSchema.parse({
    occurrence_id: uuid,
    kind: 'late_production',
    batch_id: uuid,
    handling_id: null,
    product_name: 'Caldo de legumes',
    source_code: null,
    unit: 'l',
    reason: 'Registro no fim do turno',
    created_at: '2026-11-14T12:00:00Z',
    timezone: 'America/Sao_Paulo',
    status: 'pending',
    decision_reason: null,
    decided_at: null,
    containers: [],
  });
  expect(kindLabels[row.kind]).toBe(
    'Produção registrada mais de 2 horas depois de feita',
  );
});

it('o painel aceita lote produzido (sem código de lote) sem derrubar a lista', () => {
  expect(
    containerRowSchema.parse({
      container_id: uuid,
      short_code: 'C-000001',
      kind: 'integral',
      parent_container_id: null,
      batch_id: uuid,
      product_id: uuid,
      product_name: 'Caldo de legumes',
      unit: 'l',
      source_code: null,
      expiry_date: '2026-11-16',
      expiry_origin: 'receipt',
      batch_expiry_origin: 'responsible',
      initial_quantity: 6,
      balance: 6,
      timezone: 'America/Sao_Paulo',
      created_at: '2026-11-14T12:00:00Z',
    }).source_code,
  ).toBeNull();
});
