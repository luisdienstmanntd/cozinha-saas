import { useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { ContainerGateway } from '../../batches/application/containerGateway';
import type {
  ContainerRow,
  ExpirySummary,
} from '../../batches/domain/container';
import {
  expiryBadgeText,
  getExpiryStatus,
  localCivilDate,
} from '../../batches/domain/expiryStatus';
import { formatCivilDate } from '../../../shared/format/dates';
import { StatusBadge } from '../../../shared/ui/StatusBadge';
import type { LocationGateway } from '../../locations/application/locationGateway';
import type { OccurrenceGateway } from '../../occurrences/application/occurrenceGateway';
import { blockedContainers } from '../../occurrences/domain/occurrence';
import { containerPath } from '../../labels/domain/label';
import type { Area, AreaId } from '../../navigation/domain/areas';
import type { ExpiryFilter } from '../../batches/domain/expiryFilter';

type Results = {
  summary: ExpirySummary;
  alerts: ContainerRow[];
  places: Map<string, string> | null;
  blocked: ReturnType<typeof blockedContainers> | null;
  now: Date;
};

export function OperationsOverview({
  scope: { organizationId, establishmentId },
  timezone,
  containers,
  locations,
  occurrences,
  revision,
  areas,
  select,
  expiryHref,
  selectExpiry,
}: {
  scope: CatalogScope;
  timezone: string;
  containers: ContainerGateway;
  locations?: LocationGateway;
  occurrences: OccurrenceGateway;
  revision: number;
  areas: Area[];
  select: (area: AreaId) => void;
  // V6 (D-072): cada contador abre Validades já filtrada por aquela categoria.
  expiryHref?: (filter: ExpiryFilter) => string;
  selectExpiry?: (filter: ExpiryFilter) => void;
}) {
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const scope = { organizationId, establishmentId };
    const now = new Date();
    void (async () => {
      const [summary, page, places, issues] = await Promise.all([
        containers.summary(scope, localCivilDate(now, timezone)),
        containers.list(scope, {
          includeDepleted: false,
          search: '',
          after: null,
        }),
        locations?.currents(scope).catch(() => null) ?? Promise.resolve([]),
        occurrences.list(scope, 'open').catch(() => null),
      ]);
      if (!active) return;
      setData({
        summary,
        alerts: page.rows
          .filter(
            (row) =>
              getExpiryStatus(row.expiry_date, timezone, now) !== 'upcoming',
          )
          .slice(0, 6),
        places: places
          ? new Map(places.map((row) => [row.container_id, row.location_name]))
          : null,
        blocked: issues ? blockedContainers(issues) : null,
        now,
      });
      setError(false);
    })().catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
    };
  }, [
    organizationId,
    establishmentId,
    timezone,
    containers,
    locations,
    occurrences,
    revision,
    retry,
  ]);

  function counter(filter: ExpiryFilter, children: ReactNode) {
    if (!expiryHref || !selectExpiry) return children;
    return (
      <a
        className="mesa-stat-link"
        href={expiryHref(filter)}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.ctrlKey ||
            event.shiftKey ||
            event.metaKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          selectExpiry(filter);
        }}
      >
        {children}
      </a>
    );
  }

  function available(id: AreaId) {
    return areas.some((area) => area.id === id);
  }

  return (
    <section className="mesa-overview">
      <header className="mesa-page-heading">
        <h2>Visão geral</h2>
        <p>Acompanhe as validades e priorize a operação.</p>
      </header>
      {error && (
        <div className="mesa-panel">
          <p role="alert">
            Não foi possível atualizar a visão geral da unidade.
          </p>
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setError(false);
              setRetry(retry + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {!data && !error && <p role="status">Carregando visão geral…</p>}
      {data && !error && (
        <>
          <section
            aria-label="Recipientes com saldo por validade"
            className="mesa-stats"
          >
            <div className="mesa-panel">
              {counter(
                'vencidos',
                <>
                  <span>Vencidos</span>
                  <strong className="mesa-danger">
                    {data.summary.overdue}
                  </strong>
                </>,
              )}
            </div>
            <div className="mesa-panel">
              {counter(
                'hoje',
                <>
                  <span>Vencem hoje</span>
                  <strong className="mesa-warning">
                    {data.summary.due_today}
                  </strong>
                </>,
              )}
            </div>
            <div className="mesa-panel">
              {counter(
                'amanha',
                <>
                  <span>Vencem amanhã</span>
                  <strong className="mesa-warning">
                    {data.summary.due_tomorrow}
                  </strong>
                </>,
              )}
            </div>
            <div className="mesa-panel">
              {counter(
                'posteriores',
                <>
                  <span>Após amanhã</span>
                  <strong>{data.summary.later}</strong>
                </>,
              )}
            </div>
          </section>
          <section
            className="mesa-alerts mesa-panel"
            aria-label="Atenção às validades"
          >
            <header className="mesa-panel-heading">
              <h3>Atenção às validades</h3>
              <button
                type="button"
                className="secondary"
                onClick={() => select('validade')}
              >
                Ver todos
              </button>
            </header>
            {data.blocked === null && (
              <p className="mesa-panel-message" role="status">
                Não foi possível conferir os bloqueios.
              </p>
            )}
            {data.blocked && data.blocked.size > 0 && (
              <p className="mesa-panel-message blocked-band">
                Há recipientes bloqueados. Consulte as ocorrências em Validades.
              </p>
            )}
            {data.alerts.length > 0 ? (
              <>
                <table className="mesa-table">
                  <thead>
                    <tr>
                      <th scope="col">Produto e recipiente</th>
                      <th scope="col">Local</th>
                      <th scope="col">Validade</th>
                      <th scope="col">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.alerts.map((row) => (
                      <tr key={row.container_id}>
                        <td data-label="Produto">
                          <a href={containerPath(row.container_id)}>
                            {row.product_name}
                          </a>
                          <small>
                            {row.short_code}
                            {row.source_code ? ` · ${row.source_code}` : ''}
                          </small>
                        </td>
                        <td data-label="Local">
                          {data.places?.get(row.container_id) ??
                            (data.places ? 'Sem local' : 'Local indisponível')}
                        </td>
                        <td data-label="Validade">
                          {formatCivilDate(row.expiry_date)}
                        </td>
                        <td data-label="Situação">
                          <StatusBadge
                            status={getExpiryStatus(
                              row.expiry_date,
                              timezone,
                              data.now,
                            )}
                          >
                            {expiryBadgeText(
                              row.expiry_date,
                              timezone,
                              data.now,
                            )}
                          </StatusBadge>
                          {data.blocked?.has(row.container_id) && (
                            <small>Bloqueado</small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mesa-panel-message">
                  Primeiros {data.alerts.length} recipientes com saldo, vencidos
                  ou com validade até amanhã.
                </p>
              </>
            ) : (
              <p className="mesa-panel-message">
                {data.summary.overdue > 0 ||
                data.summary.due_today > 0 ||
                data.summary.due_tomorrow > 0
                  ? 'Os totais mostram recipientes vencidos ou com validade próxima. A lista deste painel está vazia; consulte Validades para ver os registros.'
                  : 'Nenhum recipiente com saldo vencido ou a vencer até amanhã.'}
              </p>
            )}
          </section>
        </>
      )}
      <section className="mesa-shortcuts" aria-label="Ações rápidas">
        <h3>Ações rápidas</h3>
        <div className="mesa-action-row">
          {available('receber') && (
            <button type="button" onClick={() => select('receber')}>
              + Recebimento
            </button>
          )}
          {available('producao') && (
            <button
              type="button"
              className="secondary"
              onClick={() => select('producao')}
            >
              Produção
            </button>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => select('etiquetas')}
          >
            Etiquetas
          </button>
        </div>
      </section>
    </section>
  );
}
