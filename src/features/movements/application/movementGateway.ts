import type { CatalogScope } from '../../catalog/domain/catalog';
export class MovementRejected extends Error {}
export type MovementInput = {
  batchId: string;
  kind: 'consumption' | 'discard';
  quantity: string;
  reason: string | null;
  intentId: string;
};
export type Movement = {
  id: string;
  kind: 'consumption' | 'discard';
  quantity: number;
  reason: string | null;
  created_by: string;
  created_at: string;
  timezone: string;
};
export interface MovementGateway {
  list(scope: CatalogScope, batchId: string): Promise<Movement[]>;
  record(scope: CatalogScope, input: MovementInput): Promise<string>;
}
