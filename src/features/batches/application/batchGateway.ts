import type { CatalogScope } from '../../catalog/domain/catalog';
import type { BatchInput, BatchRow } from '../domain/batch';
// Recusa definitiva do banco (código de erro presente): a tentativa não chegou a ser gravada e não há
// o que conferir depois. Qualquer outro erro (conexão) deixa o resultado incerto.
export class BatchRejected extends Error {}
export interface BatchGateway {
  list(scope: CatalogScope): Promise<BatchRow[]>;
  receive(scope: CatalogScope, input: BatchInput): Promise<string>;
}
