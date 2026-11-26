import {
  workspaceAreas,
  workspacePage,
} from '../features/navigation/domain/workspaceAreas';
import { OperationsOverview } from '../features/overview/components/OperationsOverview';
import { LabelDirectory } from '../features/labels/components/LabelDirectory';
import { OperationsNav } from '../features/navigation/components/OperationsNav';
import type { configureApp } from './configureApp';
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
import { UnitMetricsPanel } from '../features/metrics/components/UnitMetricsPanel';
import {
  parseContainerParam,
  parsePlace,
  placeSearch,
} from '../features/navigation/domain/areas';
import type { AreaId } from '../features/navigation/domain/areas';
import type { UnitContext } from '../features/identity/components/IdentityHome';
import {
  parseExpiryFilter,
  type ExpiryFilter,
} from '../features/batches/domain/expiryFilter';

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
      workspaceAreas(
        canCreate,
        !!configuration.production,
        !!configuration.locations,
      ),
    [canCreate, configuration.production, configuration.locations],
  );
  const [requested, setRequested] = useState(() => ({
    search: window.location.search,
    hash: window.location.hash,
  }));
  const area = workspacePage(requested.search, requested.hash, areas);
  // V6 (D-072): filtro da lista de Validades guardado no endereço (`validade=`).
  const expiryFilter =
    area === 'validade'
      ? parseExpiryFilter(new URLSearchParams(requested.search).get('validade'))
      : null;
  // PR-11: ficha do recipiente aberta dentro da unidade (`recipiente=` no endereço), só a partir de
  // Visão geral e Etiquetas. O endereço do QR (/recipiente/:id) continua sendo outra página.
  const fichaId =
    area === 'etiquetas' || area === 'visao-geral'
      ? parseContainerParam(requested.search)
      : null;
  const fichaOpen = fichaId !== null && unit.active !== false;
  const content = useRef<HTMLDivElement>(null);
  const previous = useRef(area);
  useEffect(() => {
    function follow() {
      if (parsePlace(window.location.search).unit !== establishmentId) return;
      setRequested({
        search: window.location.search,
        hash: window.location.hash,
      });
    }
    window.addEventListener('popstate', follow);
    return () => window.removeEventListener('popstate', follow);
  }, [establishmentId]);
  useEffect(() => {
    if (previous.current !== area && unit.active !== false) {
      if (window.scrollY > 0) window.scrollTo({ top: 0 });
      content.current?.focus({ preventScroll: true });
    }
    previous.current = area;
  }, [area, unit.active]);
  function hrefFor(next: AreaId, filter: ExpiryFilter | null = null) {
    const destination = next === 'cadastros' ? 'produtos' : next;
    return `${window.location.pathname}${placeSearch(window.location.search, establishmentId, destination, filter)}`;
  }
  function fichaHref(containerId: string) {
    return `${window.location.pathname}${placeSearch(window.location.search, establishmentId, area, null, containerId)}`;
  }
  function openFicha(containerId: string) {
    window.history.pushState({ ficha: true }, '', fichaHref(containerId));
    setRequested({ search: window.location.search, hash: '' });
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  }
  function closeFicha() {
    const from = fichaId;
    if (window.history.state?.ficha) window.history.back();
    else {
      window.history.pushState(null, '', hrefFor(area));
      setRequested({ search: window.location.search, hash: '' });
    }
    if (from)
      window.setTimeout(() =>
        document
          .querySelector<HTMLElement>(`[data-ficha-for="${from}"]`)
          ?.focus(),
      );
  }
  function selectExpiry(filter: ExpiryFilter | null) {
    if (area === 'validade' && filter === expiryFilter && !window.location.hash)
      return;
    window.history.pushState(null, '', hrefFor('validade', filter));
    setRequested({ search: window.location.search, hash: '' });
  }
  function select(next: AreaId) {
    if (next === area && !window.location.hash && !fichaOpen) return;
    window.history.pushState(null, '', hrefFor(next));
    setRequested({ search: window.location.search, hash: '' });
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
      <OperationsNav
        areas={areas}
        current={area}
        hrefFor={hrefFor}
        select={select}
        unitName={unit.unitName}
        personKey={userId}
      />
      <div
        id={unit.active === false ? undefined : 'conteudo-unidade'}
        ref={content}
        tabIndex={-1}
        className="unit-content"
        aria-label={`${unit.unitName}: ${current.label}`}
        role="region"
      >
        {/* Registros não confirmados valem para qualquer área. */}
        {unit.active !== false && (
          <PendingAttempts
            scope={scope}
            userId={userId}
            timezone={timezone}
            operations={configuration.operations}
            resend={resend}
            onResolved={() => setPendingToken((value) => value + 1)}
          />
        )}
        {fichaOpen && (
          <div className="container-ficha">
            <button type="button" className="secondary" onClick={closeFicha}>
              ← Voltar para a lista
            </button>
            <LabelView
              key={fichaId}
              id={fichaId}
              gateway={configuration.labels}
              handling={tracked.handling}
              canHandle={() => canCreate}
              userId={userId}
              unitId={establishmentId}
              onOpenContainer={openFicha}
            />
          </div>
        )}
        {area === 'visao-geral' && unit.active !== false && (
          <div hidden={fichaOpen}>
            <OperationsOverview
              scope={scope}
              timezone={timezone}
              containers={configuration.containers}
              locations={configuration.locations}
              occurrences={configuration.occurrences}
              revision={pendingToken + stockToken}
              areas={areas}
              select={select}
              expiryHref={(filter) => hrefFor('validade', filter)}
              selectExpiry={selectExpiry}
              fichaHref={fichaHref}
              onOpenFicha={openFicha}
            />
          </div>
        )}
        {area === 'indicadores' && canCreate && unit.active !== false && (
          <UnitMetricsPanel
            scope={scope}
            timezone={timezone}
            gateway={configuration.metrics}
            expiryHref={(filter) => hrefFor('validade', filter)}
            selectExpiry={selectExpiry}
          />
        )}
        {area === 'etiquetas' && unit.active !== false && (
          <div hidden={fichaOpen}>
            <LabelDirectory
              scope={scope}
              containers={configuration.containers}
              revision={pendingToken + stockToken}
              fichaHref={fichaHref}
              onOpenFicha={openFicha}
            />
          </div>
        )}
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
            areaLinks={{ hrefFor: (next) => hrefFor(next), onSelect: select }}
            expiryFilter={expiryFilter}
            onExpiryFilter={selectExpiry}
          />
        </div>
        {tracked.production && (
          <div hidden={area !== 'producao'}>
            <ProductionPanel
              areaLinks={{ hrefFor, onSelect: select }}
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
              operational
            />
          </div>
        )}
        {canCreate && (
          <CatalogPanel
            gateway={configuration.catalog}
            scope={scope}
            canCreate={canCreate}
            page={
              area === 'produtos'
                ? 'products'
                : area === 'fornecedores'
                  ? 'suppliers'
                  : area === 'preparacoes'
                    ? 'preparations'
                    : null
            }
            active={unit.active !== false}
            onCreated={() => setRevision((value) => value + 1)}
          />
        )}
        <div hidden={area !== 'config-unidade'}>
          <SettingsPanel
            scope={scope}
            gateway={configuration.settings}
            canEdit={canCreate}
            onSaved={() => setSettingsToken((value) => value + 1)}
          />
        </div>
        {canCreate && (
          <div hidden={area !== 'config-organizacao'}>
            {unit.organizationTools}
          </div>
        )}
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
          Não foi possível carregar o aplicativo. Atualize a página. Se o
          problema continuar, entre em contato com o suporte.
        </p>
      </main>
    );
  }
  if (configuration.mode !== 'demo')
    return (
      <>
        <IdentityHome
          gateway={configuration.identity}
          operationalShell
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
