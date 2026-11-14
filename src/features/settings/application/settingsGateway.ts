import type { CatalogScope } from '../../catalog/domain/catalog';
import type { EstablishmentSettings } from '../domain/settings';

// Recusa definitiva do banco: nada foi gravado.
export class SettingsRejected extends Error {}

export interface SettingsGateway {
  // Configuração em vigor na unidade (os padrões, se nada foi gravado).
  get(scope: CatalogScope): Promise<EstablishmentSettings>;
  // Só o proprietário. Repetir os mesmos valores não muda nada.
  save(
    scope: CatalogScope,
    settings: EstablishmentSettings,
  ): Promise<EstablishmentSettings>;
}
