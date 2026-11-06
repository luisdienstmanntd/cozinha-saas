import type { configureApp } from './configureApp';
import { DemoHome } from '../features/demo/components/DemoHome';
import { IdentityHome } from '../features/identity/components/IdentityHome';
import { CatalogPanel } from '../features/catalog/components/CatalogPanel';

export function App({
  configuration,
}: {
  configuration: ReturnType<typeof configureApp>;
}) {
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
  if (configuration.mode === 'local')
    return (
      <IdentityHome
        gateway={configuration.identity}
        renderCatalog={(organizationId, establishmentId, canCreate) => (
          <CatalogPanel
            gateway={configuration.catalog}
            scope={{ organizationId, establishmentId }}
            canCreate={canCreate}
          />
        )}
      />
    );
  return <DemoHome />;
}
