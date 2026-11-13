import type { configureApp } from './configureApp';
import { DemoHome } from '../features/demo/components/DemoHome';
import { IdentityHome } from '../features/identity/components/IdentityHome';
import { CatalogPanel } from '../features/catalog/components/CatalogPanel';
import { BatchPanel } from '../features/batches/components/BatchPanel';
import { useState } from 'react';
import type { Access } from '../features/identity/domain/identity';
import { LabelView } from '../features/labels/components/LabelView';
import {
  containerPath,
  parseContainerPath,
} from '../features/labels/domain/label';
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
        containers={configuration.containers}
        scope={scope}
        timezone={timezone}
        canCreate={canCreate}
        catalogRevision={revision}
        userId={userId}
        labels={configuration.labels}
        movements={configuration.movements}
        occurrences={configuration.occurrences}
        handling={configuration.handling}
      />
    </>
  );
}

// Rota do QR (/recipiente/:id) e navegação entre origem e derivados sem recarregar a página
// (recarregar encerra a sessão: ela não é persistida).
function Destination({
  configuration,
  userId,
  access,
}: {
  configuration: NonNullable<ReturnType<typeof configureApp>> & {
    mode: 'local';
  };
  userId: string;
  access: Access;
}) {
  const [id, setId] = useState(() =>
    parseContainerPath(window.location.pathname),
  );
  if (!id) return null;
  const canHandle = (organizationId: string) =>
    access.some(
      (organization) =>
        organization.id === organizationId &&
        organization.memberships.some(
          (member) => member.user_id === userId && member.role === 'owner',
        ),
    );
  return (
    <LabelView
      key={id}
      id={id}
      gateway={configuration.labels}
      handling={configuration.handling}
      canHandle={canHandle}
      userId={userId}
      onOpenContainer={(next) => {
        window.history.pushState(null, '', containerPath(next));
        setId(next);
      }}
    />
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
        renderDestination={(userId, access) => (
          <Destination
            configuration={configuration}
            userId={userId}
            access={access}
          />
        )}
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
