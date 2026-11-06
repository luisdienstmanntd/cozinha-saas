import type { CatalogScope } from '../../catalog/domain/catalog';
import type { BatchInput, BatchRow } from '../domain/batch';
export interface BatchGateway {
  list(scope: CatalogScope): Promise<BatchRow[]>;
  receive(scope: CatalogScope, input: BatchInput): Promise<string>;
}
