import type { CatalogScope } from '../../catalog/domain/catalog';
import type { PendingKind } from '../domain/pending';

export type FoundOperation = {
  kind: PendingKind | 'handling_void';
  id: string;
  createdAt: string;
};
export interface OperationGateway {
  // Pergunta ao servidor se o identificador chegou a ser gravado (find_operation, só leitura, pela RLS).
  find(scope: CatalogScope, intentId: string): Promise<FoundOperation | null>;
}
