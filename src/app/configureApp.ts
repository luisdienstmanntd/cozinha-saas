import { parseEnvironment } from '../shared/config/environment';
import { createIdentityGateway } from '../features/identity/data/supabaseIdentity';
import { createOccurrenceGateway } from '../features/occurrences/data/supabaseOccurrences';
import { createCatalogGateway } from '../features/catalog/data/supabaseCatalog';
import { createClient } from '@supabase/supabase-js';
import { createBatchGateway } from '../features/batches/data/supabaseBatches';
import { createContainerGateway } from '../features/batches/data/supabaseContainers';
import { createLabelGateway } from '../features/labels/data/supabaseLabels';
import { createMovementGateway } from '../features/movements/data/supabaseMovements';
import { createEstablishmentGateway } from '../features/establishments/data/supabaseEstablishments';

export function configureApp(environment: Record<string, unknown>) {
  try {
    const config = parseEnvironment(environment);
    if (config.mode !== 'local') return { mode: 'demo' as const };
    const client = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    return {
      mode: 'local' as const,
      identity: createIdentityGateway(client),
      catalog: createCatalogGateway(client),
      batches: createBatchGateway(client),
      containers: createContainerGateway(client),
      labels: createLabelGateway(client),
      movements: createMovementGateway(client),
      occurrences: createOccurrenceGateway(client),
      establishments: createEstablishmentGateway(client),
    };
  } catch {
    return null;
  }
}
