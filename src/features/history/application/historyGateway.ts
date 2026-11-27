import type { CatalogScope } from '../../catalog/domain/catalog';
import type { HistoryEvent } from '../domain/history';

export type HistoryResult = {
  events: HistoryEvent[];
  // Algum tipo de registro tem mais linhas no período do que o limite de uma consulta.
  truncated: boolean;
};

export interface HistoryGateway {
  // Só leitura, filtrada pela RLS do banco. `from` inclusive e `to` exclusivo.
  read(
    scope: CatalogScope,
    period: { from: Date; to: Date },
  ): Promise<HistoryResult>;
}
