import type { CatalogScope } from '../../catalog/domain/catalog';
import type { HandlingInput, VoidInput } from '../domain/handling';
import type {
  Family,
  HandlingContext,
  Member,
  OpeningInfo,
} from '../domain/family';

// Recusa conhecida do banco (mensagem da lista de messages.ts) ou conflito de identificador.
export class HandlingRejected extends Error {
  constructor(
    message: string,
    readonly conflict = false,
  ) {
    super(message);
  }
}

export interface HandlingGateway {
  context(scope: CatalogScope, containerId: string): Promise<HandlingContext>;
  members(scope: CatalogScope): Promise<Member[]>;
  setDisplayName(
    scope: CatalogScope,
    userId: string,
    name: string,
  ): Promise<string>;
  handle(scope: CatalogScope, input: HandlingInput): Promise<string>;
  // Recipientes criados por uma manipulação, com saldo atual.
  created(scope: CatalogScope, handlingId: string): Promise<OpeningInfo>;
  family(scope: CatalogScope, containerId: string): Promise<Family>;
  void(scope: CatalogScope, input: VoidInput): Promise<string>;
}
