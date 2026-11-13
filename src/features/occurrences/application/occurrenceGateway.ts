import type { CatalogScope } from '../../catalog/domain/catalog';
import type {
  DecisionInput,
  OccurrenceRow,
  OccurrenceScope,
} from '../domain/occurrence';
export class DecisionRejected extends Error {}
export interface OccurrenceGateway {
  list(scope: CatalogScope, filter: OccurrenceScope): Promise<OccurrenceRow[]>;
  decide(scope: CatalogScope, input: DecisionInput): Promise<string>;
}
