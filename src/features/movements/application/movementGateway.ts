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
  kind: 'consumption' | 'discard' | 'reversal';
  quantity: number;
  reason: string | null;
  created_by: string;
  created_at: string;
  timezone: string;
  reverses_id?: string | null;
};
export interface MovementGateway {
  list(scope: CatalogScope, batchId: string): Promise<Movement[]>;
  record(scope: CatalogScope, input: MovementInput): Promise<string>;
}
