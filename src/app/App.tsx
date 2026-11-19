import { catalogSections } from '../features/navigation/domain/catalogSections';
import type { configureApp } from './configureApp';
import { EnvironmentBanner } from './EnvironmentBanner';
import { DemoHome } from '../features/demo/components/DemoHome';
import { IdentityHome } from '../features/identity/components/IdentityHome';
import { CatalogPanel } from '../features/catalog/components/CatalogPanel';
import { LocationsPanel } from '../features/locations/components/LocationsPanel';
import { BatchPanel } from '../features/batches/components/BatchPanel';
import { useEffect, useMemo, useRef, useState } from 'react';
import { trackGateways } from '../features/pending/application/trackGateways';
import { PendingAttempts } from '../features/pending/components/PendingAttempts';
import type { PendingAttempt } from '../features/pending/domain/pending';
import type { Access } from '../features/identity/domain/identity';
import { LabelView } from '../features/labels/components/LabelView';
import {
  containerPath,
  parseContainerPath,
} from '../features/labels/domain/label';
import { ProductionPanel } from '../features/production/components/ProductionPanel';
import { EstablishmentTools } from '../features/establishments/components/EstablishmentTools';
import { SettingsPanel } from '../features/settings/components/SettingsPanel';
import { UnitNav } from '../features/navigation/components/UnitNav';
import {
  areasFor,
  parsePlace,
  placeSearch,
  resolveArea,
} from '../features/navigation/domain/areas';
import type { AreaId } from '../features/navigation/domain/areas';
import type { UnitContext } from '../features/identity/components/IdentityHome';

function Workspace({
  configuration,
  organizationId,
  establishmentId,
  canCreate,
  userId,
  timezone,
  unit,
}: {
  configuration: NonNullable<ReturnType<typeof configureApp>> & {
    mode: 'local' | 'hosted';
  };
  organizationId: string;
  establishmentId: string;
  canCreate: boolean;
  userId: string;
  timezone: string;
  unit: UnitContext;
}) {
  const [revision, setRevision] = useState(0);
  const [pendingToken, setPendingToken] = useState(0);
  // Fatia 7.3: produção registrada ou anulada muda a lista de recipientes.
  const [stockToken, setStockToken] = useState(0);
  // Fatia 7.6: configuração salva muda quem registra produção e a janela.
  const [settingsToken, setSettingsToken] = useState(0);
  const scope = { organizationId, establishmentId };
  // V1: a unidade se divide em áreas. Todas ficam montadas e as inativas só ocultas (`hidden`),
  // então o que foi digitado em um formulário não se perde ao trocar de área.
  const areas = useMemo(
    () =>
      areasFor({
        owner: canCreate,
        production: !!configuration.production,
        locations: !!configuration.locations,
      }),
    [canCreate, configuration.production, configuration.locations],
  );
  const [area, setArea] = useState<AreaId>(() =>
    resolveArea(parsePlace(window.location.search).area, areas),
  );
  const content = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const keepNavigationFocus = useRef(false);
  useEffect(() => {
    function follow() {
      setArea(resolveArea(parsePlace(window.location.search).area, areas));
    }
    window.addEventListener('popstate', follow);
    return () => window.removeEventListener('popstate', follow);
  }, [areas]);
  useEffect(() => {
    // Leitor de tela e teclado seguem para o conteúdo da área escolhida (não na primeira carga).
    const section =
      area === 'cadastros' &&
      catalogSections.find(({ id }) => window.location.hash === `#${id}`);
    const destination = section ? document.getElementById(section.id) : null;
    if (destination) {
      destination.focus({ preventScroll: true });
      destination.scrollIntoView?.({ block: 'start' });
    } else if (moved.current && !keepNavigationFocus.current) {
      content.current?.focus();
    }
    keepNavigationFocus.current = false;
    moved.current = true;
  }, [area]);
  const hrefFor = (next: AreaId) =>
    `${window.location.pathname}${placeSearch(window.location.search, establishmentId, next)}`;
  function select(next: AreaId, options?: { keepFocus: boolean }) {
    if (next === area) return;
    keepNavigationFocus.current = options?.keepFocus ?? false;
    window.history.pushState(null, '', hrefFor(next));
    setArea(next);
  }
  const current = areas.find((item) => item.id === area) ?? areas[0]!;
  // Escritas passam pelo decorador: tentativa de resultado incerto fica guardada até ser conferida.
  const tracked = useMemo(
    () =>
      trackGateways(
        {
          batches: configuration.batches,
          movements: configuration.movements,
          occurrences: configuration.occurrences,
          handling: configuration.handling,
          locations: configuration.locations,
          production: configuration.production,
        },
        userId,
      ),
    [configuration, userId],
  );
  function resend(attempt: PendingAttempt) {
    const target = {
      organizationId: attempt.organizationId,
      establishmentId: attempt.establishmentId,
    };
    // O mesmo identificador e os mesmos dados da tentativa; o gateway valida de novo.
    const input = attempt.input as never;
    switch (attempt.kind) {
      case 'receipt':
        return tracked.batches.receive(target, input);
      case 'handling':
        return tracked.handling.handle(target, input);
      case 'void':
        return tracked.handling.void(target, input);
      case 'decision':
        return tracked.occurrences.decide(target, input);
      case 'movement':
        return tracked.movements.record(target, input);
      case 'location_move':
        return tracked.locations!.move(target, input);
      case 'location':
        return tracked.locations!.create(target, input);
      case 'production':
        return tracked.production!.register(target, input);
      case 'production_void':
        return tracked.production!.void(target, input);
    }
  }
  return (
    <div className="unit-layout">
      <UnitNav
        areas={areas}
        current={area}
        hrefFor={hrefFor}
        onSelect={select}
        catalogMenu={canCreate}
      />
      <div
        id="conteudo-unidade"
        ref={content}
        tabIndex={-1}
        className="unit-content"
        aria-label={`${unit.unitName}: ${current.label}`}
        role="region"
      >
        {/* Registros não confirmados valem para qualquer área. */}
        <PendingAttempts
          scope={scope}
          userId={userId}
          timezone={timezone}
          operations={configuration.operations}
          resend={resend}
          onResolved={() => setPendingToken((value) => value + 1)}
        />
        <div hidden={area !== 'validade' && area !== 'receber'}>
          <BatchPanel
            area={area === 'receber' ? 'receber' : 'validade'}
            catalog={configuration.catalog}
            batches={tracked.batches}
            containers={configuration.containers}
            scope={scope}
            timezone={timezone}
            canCreate={canCreate}
            catalogRevision={revision}
            reloadToken={pendingToken + stockToken}
            userId={userId}
            labels={configuration.labels}
            movements={tracked.movements}
            occurrences={tracked.occurrences}
            handling={tracked.handling}
            locations={tracked.locations}
            areaLinks={{ hrefFor, onSelect: select }}
          />
        </div>
        {tracked.production && (
          <div hidden={area !== 'producao'}>
            <ProductionPanel
              scope={scope}
              timezone={timezone}
              userId={userId}
              canCreate={canCreate}
              catalog={configuration.catalog}
              gateway={tracked.production}
              loadMembers={tracked.handling.members}
              setDisplayName={tracked.handling.setDisplayName}
              catalogRevision={revision}
              reloadToken={pendingToken}
              labels={configuration.labels}
              onChanged={() => setStockToken((value) => value + 1)}
              settings={configuration.settings}
              settingsRevision={settingsToken}
            />
          </div>
        )}
        {tracked.locations && (
          <div hidden={area !== 'locais'}>
            <LocationsPanel
              scope={scope}
              gateway={tracked.locations}
              canManage={canCreate}
            />
          </div>
        )}
        <div hidden={area !== 'cadastros'}>
          {canCreate && (
            <CatalogPanel
              gateway={configuration.catalog}
              scope={scope}
              canCreate={canCreate}
              sectionIds={[
                catalogSections[0].id,
                catalogSections[1].id,
                catalogSections[2].id,
              ]}
              onCreated={() => setRevision((value) => value + 1)}
            />
          )}
          <div
            id={catalogSections[3].id}
            className="catalog-destination"
            tabIndex={-1}
          >
            <SettingsPanel
              scope={scope}
              gateway={configuration.settings}
              canEdit={canCreate}
              onSaved={() => setSettingsToken((value) => value + 1)}
            />
          </div>
          {canCreate && unit.organizationTools && (
            <div
              id={catalogSections[4].id}
              className="catalog-destination"
              tabIndex={-1}
            >
              {unit.organizationTools}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Rota do QR (/recipiente/:id) e navegação entre origem e derivados sem recarregar a página.
// V2 (D-025): abrir o QR no mesmo navegador reaproveita a sessão guardada, se ainda valer.
function Destination({
  configuration,
  userId,
  access,
}: {
  configuration: NonNullable<ReturnType<typeof configureApp>> & {
    mode: 'local' | 'hosted';
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
        <h1>Não foi possível iniciar o aplicativo</h1>
        <p role="alert">
          Configuração inválida. Use demo, Supabase local ou o ambiente
          hospedado completo (modo, endereço, chave publicável e nome do
          ambiente). Por segurança, esta tela não mostra os valores
          configurados.
        </p>
      </main>
    );
  }
  if (configuration.mode !== 'demo')
    return (
      <>
        <EnvironmentBanner environmentName={configuration.environmentName} />
        <IdentityHome
          environmentNotice={
            configuration.mode === 'hosted'
              ? 'Contas e vínculos são preparados pelo responsável pelo ambiente.'
              : undefined
          }
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
            unit,
          ) => (
            <Workspace
              configuration={configuration}
              organizationId={organizationId}
              establishmentId={establishmentId}
              canCreate={canCreate}
              userId={userId}
              timezone={timezone}
              unit={unit}
            />
          )}
        />
      </>
    );
  return <DemoHome />;
}
