import type {
  CatalogInput,
  CatalogItem,
  CatalogKind,
  CatalogScope,
} from '../domain/catalog';

export interface CatalogGateway {
  list(kind: CatalogKind, scope: CatalogScope): Promise<CatalogItem[]>;
  create(
    kind: CatalogKind,
    scope: CatalogScope,
    input: CatalogInput,
  ): Promise<CatalogItem>;
}
