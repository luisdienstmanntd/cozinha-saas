import type { CatalogScope } from '../../catalog/domain/catalog';
import type {
  CreateLocationInput,
  CurrentLocation,
  MoveInput,
  StorageLocation,
} from '../domain/locations';

// Recusa conhecida do banco (mensagem da lista de locations.ts) ou conflito de identificador.
export class LocationRejected extends Error {
  constructor(
    message: string,
    readonly conflict = false,
    // Divergência de condição: a tela pode oferecer a confirmação.
    readonly needsConfirmation = false,
  ) {
    super(message);
  }
}

export interface LocationGateway {
  list(scope: CatalogScope): Promise<StorageLocation[]>;
  // Local atual de cada recipiente que tem local (maior seq).
  currents(scope: CatalogScope): Promise<CurrentLocation[]>;
  create(scope: CatalogScope, input: CreateLocationInput): Promise<string>;
  setActive(
    scope: CatalogScope,
    locationId: string,
    active: boolean,
  ): Promise<void>;
  move(scope: CatalogScope, input: MoveInput): Promise<string>;
}
