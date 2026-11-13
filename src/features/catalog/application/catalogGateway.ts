import type {
  StorageCondition,
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
  // Define a conservação do produto uma única vez (set_product_storage_condition).
  setStorageCondition(
    scope: CatalogScope,
    productId: string,
    condition: StorageCondition,
  ): Promise<StorageCondition>;
}
