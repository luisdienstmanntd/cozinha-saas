import {
  assertModeAllowedOnHost,
  parseEnvironment,
} from '../shared/config/environment';
import { createIdentityGateway } from '../features/identity/data/supabaseIdentity';
import { createOccurrenceGateway } from '../features/occurrences/data/supabaseOccurrences';
import { createCatalogGateway } from '../features/catalog/data/supabaseCatalog';
import { createClient } from '@supabase/supabase-js';
import { createBatchGateway } from '../features/batches/data/supabaseBatches';
import { createContainerGateway } from '../features/batches/data/supabaseContainers';
import { createLabelGateway } from '../features/labels/data/supabaseLabels';
import { createMovementGateway } from '../features/movements/data/supabaseMovements';
import { createHandlingGateway } from '../features/handling/data/supabaseHandling';
import { createLocationGateway } from '../features/locations/data/supabaseLocations';
import { createOperationGateway } from '../features/pending/data/supabaseOperations';
import { createProductionGateway } from '../features/production/data/supabaseProduction';
import { createEstablishmentGateway } from '../features/establishments/data/supabaseEstablishments';
import { createSettingsGateway } from '../features/settings/data/supabaseSettings';

// `hostname` vem de window.location na inicialização; o padrão é a máquina local (testes e desenvolvimento).
export function configureApp(
  environment: Record<string, unknown>,
  hostname = 'localhost',
) {
  try {
    const config = parseEnvironment(environment);
    assertModeAllowedOnHost(config.mode, hostname, environment);
    if (config.mode === 'demo') return { mode: 'demo' as const };
    const client = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    return {
      mode: config.mode,
      environmentName:
        config.mode === 'hosted' ? config.environmentName : undefined,
      identity: createIdentityGateway(client),
      catalog: createCatalogGateway(client),
      batches: createBatchGateway(client),
      containers: createContainerGateway(client),
      labels: createLabelGateway(client),
      movements: createMovementGateway(client),
      occurrences: createOccurrenceGateway(client),
      handling: createHandlingGateway(client),
      locations: createLocationGateway(client),
      operations: createOperationGateway(client),
      production: createProductionGateway(client),
      establishments: createEstablishmentGateway(client),
      settings: createSettingsGateway(client),
    };
  } catch {
    return null;
  }
}
