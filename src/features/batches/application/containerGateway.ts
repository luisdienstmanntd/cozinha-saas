import type { CatalogScope } from '../../catalog/domain/catalog';
import type {
  ContainerPage,
  ContainerQuery,
  ContainerRow,
  ExpirySummary,
} from '../domain/container';
export interface ContainerGateway {
  list(scope: CatalogScope, query: ContainerQuery): Promise<ContainerPage>;
  get(scope: CatalogScope, containerId: string): Promise<ContainerRow | null>;
  summary(scope: CatalogScope, referenceDate: string): Promise<ExpirySummary>;
}
