import {
  assertModeAllowedOnHost,
  parseEnvironment,
} from '../shared/config/environment';
import {
  AUTH_STORAGE_KEY,
  createIdentityGateway,
} from '../features/identity/data/supabaseIdentity';
import { createSessionFetch } from '../features/identity/data/sessionFetch';
import { createOccurrenceGateway } from '../features/occurrences/data/supabaseOccurrences';
import { createCatalogGateway } from '../features/catalog/data/supabaseCatalog';
import { setOfficialOrigin } from '../features/labels/application/labelOrigin';
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
import { createAccountGateway } from '../features/account/data/supabaseAccount';
import { createMetricsGateway } from '../features/metrics/data/supabaseMetrics';
import { createHistoryGateway } from '../features/history/data/supabaseHistory';
import { createTeamGateway } from '../features/team/data/supabaseTeam';

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// `hostname` vem de window.location na inicialização; o padrão é a máquina local (testes e desenvolvimento).
export function configureApp(
  environment: Record<string, unknown>,
  hostname = 'localhost',
) {
  try {
    const config = parseEnvironment(environment);
    assertModeAllowedOnHost(config.mode, hostname, environment);
    setOfficialOrigin(config.mode === 'hosted' ? config.appUrl : null);
    if (config.mode === 'demo') return { mode: 'demo' as const };
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
      mode: config.mode,
      environmentName:
        config.mode === 'hosted' ? config.environmentName : undefined,
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
      metrics: createMetricsGateway(client),
      history: createHistoryGateway(client),
      team: createTeamGateway(client),

      account: createAccountGateway(client),
    };
  } catch {
    return null;
  }
}
