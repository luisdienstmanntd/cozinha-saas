import type { CatalogScope } from '../../catalog/domain/catalog';
import type {
  ProductionInput,
  ProductionRow,
  ProductionVoidInput,
} from '../domain/production';

// Recusa definitiva do banco: a operação não foi gravada. `conflict` = identificador usado com outros
// dados (conferir antes de começar outra tentativa).
export class ProductionRejected extends Error {
  constructor(
    message: string,
    readonly conflict = false,
  ) {
    super(message);
  }
}

export interface ProductionGateway {
  // Produções mais recentes da unidade (até 50), com o recipiente integral e a anulação, se houver.
  list(scope: CatalogScope): Promise<ProductionRow[]>;
  // Devolve o identificador do lote produzido.
  register(scope: CatalogScope, input: ProductionInput): Promise<string>;
  // Devolve o identificador da anulação.
  void(scope: CatalogScope, input: ProductionVoidInput): Promise<string>;
}
