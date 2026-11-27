import { useEffect, useMemo, useState } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import { formatDateTime } from '../../../shared/format/dates';
import { PageHeader } from '../../../shared/ui/PageHeader';
import { StatePanel } from '../../../shared/ui/StatePanel';
import type {
  HistoryGateway,
  HistoryResult,
} from '../application/historyGateway';
import {
  DEFAULT_HISTORY_PERIOD,
  HISTORY_GROUPS,
  HISTORY_PERIODS,
  csvFilename,
  filterEvents,
  groupLabels,
  periodLabels,
  periodRange,
  toCsv,
  type HistoryGroup,
  type HistoryPeriod,
} from '../domain/history';

// D-079: histórico da unidade (só leitura) com exportação em CSV. Só o proprietário vê esta área; a
// leitura continua filtrada pela RLS. Nada aqui grava, corrige ou apaga registro.
const LOAD_ERROR = 'Não foi possível carregar o histórico da unidade.';

function downloadCsv(text: string, filename: string) {
  const href = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function HistoryPanel({
  scope,
  timezone,
  unitName,
  gateway,
}: {
  scope: CatalogScope;
  timezone: string;
  unitName: string;
  gateway: HistoryGateway;
}) {
  const { organizationId, establishmentId } = scope;
  const [days, setDays] = useState<HistoryPeriod>(DEFAULT_HISTORY_PERIOD);
  const [data, setData] = useState<HistoryResult | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [retry, setRetry] = useState(0);
  const [groups, setGroups] = useState<ReadonlySet<HistoryGroup>>(
    () => new Set(HISTORY_GROUPS),
  );
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    gateway
      .read({ organizationId, establishmentId }, periodRange(new Date(), days))
      .then(
        (result) => {
          if (!active) return;
          setData(result);
          setStatus('ready');
        },
        () => {
          if (active) setStatus('error');
        },
      );
    return () => {
      active = false;
    };
  }, [gateway, organizationId, establishmentId, days, retry]);

  const shown = useMemo(
    () => (data ? filterEvents(data.events, groups, search) : []),
    [data, groups, search],
  );
  function reload(next: HistoryPeriod = days) {
    setStatus('loading');
    if (next === days) setRetry((value) => value + 1);
    else setDays(next);
  }
  function toggle(group: HistoryGroup) {
    setGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }
  const loading = status === 'loading';

  return (
    <section className="mesa-overview history-page" aria-label="Histórico">
      <PageHeader
        title="Histórico"
        description="Registros da unidade no período escolhido, do mais recente ao mais antigo. Só consulta: nada aqui altera ou apaga registros."
        primary={
          <button
            type="button"
            disabled={loading || status === 'error' || shown.length === 0}
            onClick={() =>
              downloadCsv(
                toCsv(shown, timezone),
                csvFilename(unitName, new Date(), timezone),
              )
            }
          >
            Exportar CSV
          </button>
        }
      />
      <div className="history-controls">
        <div
          role="group"
          aria-label="Período do histórico"
          className="production-period"
        >
          {HISTORY_PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              className="secondary"
              aria-pressed={days === value}
              disabled={loading && days !== value}
              onClick={() => {
                if (value !== days) reload(value);
              }}
            >
              {periodLabels[value]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="secondary"
          disabled={loading}
          onClick={() => reload()}
        >
          Atualizar histórico
        </button>
      </div>
      <fieldset className="history-groups">
        <legend>Tipos de registro</legend>
        {HISTORY_GROUPS.map((group) => (
          <label key={group}>
            <input
              type="checkbox"
              checked={groups.has(group)}
              onChange={() => toggle(group)}
            />{' '}
            {groupLabels[group]}
          </label>
        ))}
      </fieldset>
      <label className="history-search">
        Buscar no histórico
        <input
          type="search"
          value={search}
          maxLength={80}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Produto, recipiente, pessoa ou motivo"
        />
      </label>
      {loading && (
        <StatePanel kind="loading" message="Carregando o histórico…" />
      )}
      {status === 'error' && (
        <StatePanel
          kind="error"
          message={LOAD_ERROR}
          onRetry={() => reload()}
        />
      )}
      {status === 'ready' && data && (
        <>
          {data.truncated && (
            <p role="note" className="history-note">
              Há mais registros no período do que a consulta traz de uma vez. O
              histórico e o CSV mostram os mais recentes de cada tipo; escolha
              um período menor para ver o restante.
            </p>
          )}
          {shown.length === 0 ? (
            <StatePanel
              kind="zero"
              message={
                data.events.length === 0
                  ? 'Nenhum registro no período.'
                  : 'Nenhum registro com esses filtros.'
              }
            />
          ) : (
            <>
              <p role="status" className="history-count">
                {shown.length === 1
                  ? '1 registro'
                  : `${shown.length} registros`}
                {' · o CSV leva exatamente esta lista'}
              </p>
              <ul aria-label="Registros do histórico" className="history-list">
                {shown.map((event) => (
                  <li key={event.id} className="mesa-panel history-item">
                    <div className="history-item-head">
                      <strong>{event.title}</strong>
                      <time dateTime={event.at}>
                        {formatDateTime(event.at, timezone)}
                      </time>
                    </div>
                    <p>
                      {[event.product, event.container, event.quantity]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {event.detail && <p>{event.detail}</p>}
                    {event.reason && (
                      <p>Motivo ou observação: {event.reason}</p>
                    )}
                    {event.actor && (
                      <p className="history-actor">Por {event.actor}</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
