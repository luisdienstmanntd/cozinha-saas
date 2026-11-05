import { DemoHome } from '../features/demo/components/DemoHome';
import { parseEnvironment } from '../shared/config/environment';
import { useMemo } from 'react';
import { createIdentityGateway } from '../features/identity/data/supabaseIdentity';
import { IdentityHome } from '../features/identity/components/IdentityHome';

export function App({
  environment = import.meta.env,
}: {
  environment?: Record<string, unknown>;
}) {
  const configuration = useMemo(() => {
    try {
      const config = parseEnvironment(environment);
      return {
        config,
        gateway:
          config.mode === 'local'
            ? createIdentityGateway(config.url, config.publishableKey)
            : null,
      };
    } catch {
      return null;
    }
  }, [environment]);
  if (!configuration) {
    return (
      <main className="page configuration-error">
        <h1>Não foi possível iniciar a demonstração</h1>
        <p role="alert">
          Configuração inválida. Use demo ou Supabase local com chave
          publicável.
        </p>
      </main>
    );
  }
  if (configuration.gateway)
    return <IdentityHome gateway={configuration.gateway} />;
  return <DemoHome />;
}
