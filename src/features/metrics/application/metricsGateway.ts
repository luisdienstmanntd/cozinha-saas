import type { CatalogScope } from '../../catalog/domain/catalog';
import type { Period, UnitMetrics } from '../domain/metrics';

export interface MetricsGateway {
  // Só leitura. O banco filtra pela RLS; período de no máximo 366 dias.
  read(scope: CatalogScope, period: Period): Promise<UnitMetrics>;
}
