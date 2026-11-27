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
  updateSupplier?(
    scope: CatalogScope,
    id: string,
    input: CatalogInput,
  ): Promise<CatalogItem>;
  deleteSupplier?(scope: CatalogScope, id: string): Promise<void>;
  // Define a conservação do produto uma única vez (set_product_storage_condition).
  setStorageCondition(
    scope: CatalogScope,
    productId: string,
    condition: StorageCondition,
  ): Promise<StorageCondition>;
  // Fatia 7.7: janela de registro da produção da preparação, em minutos (null = volta à da unidade).
  // Só o proprietário; auditada no banco. Opcional na interface para não obrigar os dublês de teste.
  setProductionWindow?(
    scope: CatalogScope,
    productId: string,
    minutes: number | null,
  ): Promise<number | null>;
}
