import type { CatalogScope } from '../../catalog/domain/catalog';
export class MovementRejected extends Error {}
export type MovementInput = {
  batchId: string;
  kind: 'consumption' | 'discard' | 'reversal';
  quantity: string;
  reason: string | null;
  intentId: string;
  targetId?: string;
};
export type Movement = {
  id: string;
  // 'transfer' (fatia 6.3): saída para recipientes derivados; só é desfeita pela anulação da
  // manipulação (6.4), nunca por "Anular registro".
  kind: 'consumption' | 'discard' | 'reversal' | 'transfer';
  quantity: number;
  reason: string | null;
  created_by: string;
  created_at: string;
  timezone: string;
  reverses_id?: string | null;
  // Manipulação que gerou o movimento (transferência ou descarte de sobra).
  handlingId?: string | null;
};
export interface MovementGateway {
  list(scope: CatalogScope, batchId: string): Promise<Movement[]>;
  record(scope: CatalogScope, input: MovementInput): Promise<string>;
}
