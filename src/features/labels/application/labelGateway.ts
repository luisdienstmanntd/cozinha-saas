import type { CatalogScope } from '../../catalog/domain/catalog';
import type { LabelData } from '../domain/label';
export interface LabelGateway {
  ensure(scope: CatalogScope, batchId: string): Promise<string>;
  get(id: string): Promise<LabelData>;
}
