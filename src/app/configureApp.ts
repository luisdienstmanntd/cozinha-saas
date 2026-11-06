import { parseEnvironment } from '../shared/config/environment';
import { createIdentityGateway } from '../features/identity/data/supabaseIdentity';
import { createCatalogGateway } from '../features/catalog/data/supabaseCatalog';
import { createClient } from '@supabase/supabase-js';

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
    };
  } catch {
    return null;
  }
}
