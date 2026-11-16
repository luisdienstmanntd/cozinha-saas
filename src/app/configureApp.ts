import { parseEnvironment } from '../shared/config/environment';
import {
  AUTH_STORAGE_KEY,
  createIdentityGateway,
} from '../features/identity/data/supabaseIdentity';
import { createSessionFetch } from '../features/identity/data/sessionFetch';
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

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function configureApp(environment: Record<string, unknown>) {
  try {
    const config = parseEnvironment(environment);
    if (config.mode !== 'local') return { mode: 'demo' as const };
    // V2 (D-025): a sessão fica guardada neste navegador (recarregar e abrir o QR não pedem login);
    // quem limita a inatividade a 30 minutos é o banco (session_guard.check_request), e o aplicativo
    // sai da conta quando a API responde SESSION_EXPIRED.
    const events = createSessionFetch();
    const storage = browserStorage();
    const client = createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        storageKey: AUTH_STORAGE_KEY,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        ...(storage ? { storage } : {}),
      },
      global: { fetch: events.fetch },
    });
    return {
      mode: 'local' as const,
      identity: createIdentityGateway(client, { events, storage }),
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
