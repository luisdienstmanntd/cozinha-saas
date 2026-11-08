import type { configureApp } from './configureApp';
import { DemoHome } from '../features/demo/components/DemoHome';
import { IdentityHome } from '../features/identity/components/IdentityHome';
import { CatalogPanel } from '../features/catalog/components/CatalogPanel';
import { BatchPanel } from '../features/batches/components/BatchPanel';
import { useState } from 'react';
import { LabelView } from '../features/labels/components/LabelView';
import { parseContainerPath } from '../features/labels/domain/label';
import { EstablishmentTools } from '../features/establishments/components/EstablishmentTools';

function Workspace({
  configuration,
  organizationId,
  establishmentId,
  canCreate,
  userId,
  timezone,
}: {
  configuration: NonNullable<ReturnType<typeof configureApp>> & {
    mode: 'local';
  };
  organizationId: string;
  establishmentId: string;
  canCreate: boolean;
  userId: string;
  timezone: string;
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
        timezone={timezone}
        canCreate={canCreate}
        catalogRevision={revision}
        userId={userId}
        labels={configuration.labels}
        movements={configuration.movements}
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
        renderOrganizationTools={(organization, owner, onChanged, busy) => (
          <EstablishmentTools
            gateway={configuration.establishments}
            organization={organization}
            owner={owner}
            onChanged={onChanged}
            busy={busy}
          />
        )}
        renderDestination={() => {
          const id = parseContainerPath(window.location.pathname);
          return id ? (
            <LabelView id={id} gateway={configuration.labels} />
          ) : null;
        }}
        renderCatalog={(
          organizationId,
          establishmentId,
          canCreate,
          userId,
          timezone,
        ) => (
          <Workspace
            configuration={configuration}
            organizationId={organizationId}
            establishmentId={establishmentId}
            canCreate={canCreate}
            userId={userId}
            timezone={timezone}
          />
        )}
      />
    );
  return <DemoHome />;
}
