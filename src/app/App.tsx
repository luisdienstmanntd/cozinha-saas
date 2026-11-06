import type { configureApp } from './configureApp';
import { DemoHome } from '../features/demo/components/DemoHome';
import { IdentityHome } from '../features/identity/components/IdentityHome';
import { CatalogPanel } from '../features/catalog/components/CatalogPanel';
import { BatchPanel } from '../features/batches/components/BatchPanel';
import { useState } from 'react';

function Workspace({
  configuration,
  organizationId,
  establishmentId,
  canCreate,
  userId,
}: {
  configuration: NonNullable<ReturnType<typeof configureApp>> & {
    mode: 'local';
  };
  organizationId: string;
  establishmentId: string;
  canCreate: boolean;
  userId: string;
}) {
  const [revision, setRevision] = useState(0);
  const scope = { organizationId, establishmentId };
  return (
    <>
      <CatalogPanel
        gateway={configuration.catalog}
        scope={scope}
        canCreate={canCreate}
        onCreated={() => setRevision((value) => value + 1)}
      />
      <BatchPanel
        catalog={configuration.catalog}
        batches={configuration.batches}
        scope={scope}
        canCreate={canCreate}
        catalogRevision={revision}
        userId={userId}
      />
    </>
  );
}

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
        renderCatalog={(organizationId, establishmentId, canCreate, userId) => (
          <Workspace
            configuration={configuration}
            organizationId={organizationId}
            establishmentId={establishmentId}
            canCreate={canCreate}
            userId={userId}
          />
        )}
      />
    );
  return <DemoHome />;
}
