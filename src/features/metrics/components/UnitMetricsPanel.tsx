import { useEffect, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { ExpiryFilter } from '../../batches/domain/expiryFilter';
import { formatDateTime } from '../../../shared/format/dates';
import type { MetricsGateway } from '../application/metricsGateway';
import {
  DEFAULT_PERIOD,
  PERIOD_DAYS,
  elapsedText,
  periodEnding,
  periodLabels,
  shareText,
  type Period,
  type PeriodDays,
  type UnitMetrics,
} from '../domain/metrics';

// D-076: painel só leitura com os indicadores da unidade (`pilot_metrics`). Aparece só para o
// proprietário; a leitura continua filtrada pela RLS no banco. Nada aqui grava ou decide.

type Tone = 'danger' | 'warning' | null;
type Tile = {
  label: string;
  value: string;
  hint?: string | null;
  tone?: Tone;
  // PR-08: barra de participação, só quando há base (total > 0); o texto "N% do total" continua.
  share?: { part: number; total: number };
};

const EMPTY_TIME = 'Sem registros no período';
const LOAD_ERROR = 'Não foi possível carregar os indicadores da unidade.';

function time(label: string, seconds: number | null): Tile {
  const text = elapsedText(seconds);
  return { label, value: text ?? '—', hint: text ? null : EMPTY_TIME };
}

function counted(
  label: string,
  value: number,
  options: { of?: number; tone?: Tone } = {},
): Tile {
  return {
    label,
    value: String(value),
    hint: options.of === undefined ? null : shareText(value, options.of),
    tone: value > 0 ? (options.tone ?? null) : null,
    share:
      options.of !== undefined && options.of > 0
        ? { part: value, total: options.of }
        : undefined,
  };
}

function Group({
  title,
  description,
  tiles,
  className = '',
  children,
}: {
  title: string;
  description: string;
  tiles: Tile[];
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={`mesa-panel metrics-group ${className}`.trim()}
      aria-label={title}
    >
      <header className="mesa-panel-heading metrics-group-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {children}
      </header>
      <dl className="metrics-tiles">
        {tiles.map((tile) => (
          <div key={tile.label} className="metrics-tile">
            <dt>{tile.label}</dt>
            <dd
              className={
                tile.tone === 'danger'
                  ? 'mesa-danger'
                  : tile.tone === 'warning'
                    ? 'mesa-warning'
                    : undefined
              }
            >
              {tile.value}
            </dd>
            {tile.hint && <dd className="metrics-hint">{tile.hint}</dd>}
            {tile.share && (
              <dd className="metrics-hint" aria-hidden="true">
                <progress
                  className="metrics-bar"
                  max={tile.share.total}
                  value={tile.share.part}
                />
              </dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  );
}

type Loaded = { metrics: UnitMetrics; period: Period; days: PeriodDays };

export function UnitMetricsPanel({
  scope: { organizationId, establishmentId },
  timezone,
  gateway,
  expiryHref,
  selectExpiry,
}: {
  scope: CatalogScope;
  timezone: string;
  gateway: MetricsGateway;
  expiryHref?: (filter: ExpiryFilter) => string;
  selectExpiry?: (filter: ExpiryFilter) => void;
}) {
  const [days, setDays] = useState<PeriodDays>(DEFAULT_PERIOD);
  const [data, setData] = useState<Loaded | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const period = periodEnding(new Date(), days);
    gateway.read({ organizationId, establishmentId }, period).then(
      (metrics) => {
        if (!active) return;
        setData({ metrics, period, days });
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

  const loading = status === 'loading';
  const error = status === 'error';
  const m = data?.metrics;

  function reload(next: PeriodDays = days) {
    setStatus('loading');
    if (next === days) setRetry((value) => value + 1);
    else setDays(next);
  }

  function expiredLink() {
    if (!expiryHref || !selectExpiry || !m) return null;
    return (
      <a
        className="metrics-link"
        href={expiryHref('vencidos')}
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
          selectExpiry('vencidos');
        }}
      >
        Ver vencidos em Validades
      </a>
    );
  }

  return (
    <section className="mesa-overview metrics-page">
      <header className="mesa-page-heading metrics-heading">
        <div>
          <h2>Indicadores</h2>
          <p>
            Acompanhe registros, atrasos e ocorrências desta unidade no período
            escolhido.
          </p>
        </div>
        <div className="metrics-controls">
          <div
            role="group"
            aria-label="Período dos indicadores"
            className="production-period"
          >
            {PERIOD_DAYS.map((value) => (
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
            Atualizar
          </button>
        </div>
      </header>
      {error && (
        <div className="mesa-panel">
          <p role="alert" className="mesa-panel-message">
            {LOAD_ERROR}
          </p>
          <p className="mesa-panel-message">
            <button
              className="secondary"
              type="button"
              onClick={() => reload()}
            >
              Tentar novamente
            </button>
          </p>
        </div>
      )}
      {loading && <p role="status">Carregando indicadores…</p>}
      {!loading && !error && data && m && (
        <>
          <p className="metrics-period" role="status">
            {periodLabels[data.days]}: de{' '}
            {formatDateTime(data.period.from, timezone)} a{' '}
            {formatDateTime(data.period.to, timezone)}.
          </p>
          <Group
            className="metrics-group-now"
            title="Situação agora"
            description="Contagem de agora, independente do período escolhido."
            tiles={[
              counted(
                'Recipientes vencidos com saldo',
                m.containers_expired_with_balance,
                { tone: 'danger' },
              ),
            ]}
          >
            {m.containers_expired_with_balance > 0 && expiredLink()}
          </Group>
          <div className="metrics-groups">
            <Group
              title="Abertura e porcionamento"
              description="Manipulações de recipientes registradas no período."
              tiles={[
                counted('Manipulações', m.handlings_total),
                counted('Com a validade da origem', m.handlings_same_expiry, {
                  of: m.handlings_total,
                }),
                counted(
                  'Com validade menor que a da origem',
                  m.handlings_shorter_expiry,
                  { of: m.handlings_total },
                ),
                counted('Registradas com atraso', m.handlings_late, {
                  of: m.handlings_total,
                  tone: 'warning',
                }),
                counted('Anulações', m.handling_voids_total),
                time(
                  'Tempo até o registro (mediana)',
                  m.handling_delay_p50_seconds,
                ),
                time(
                  'Maior tempo até o registro',
                  m.handling_delay_max_seconds,
                ),
              ]}
            />
            <Group
              title="Produção da cozinha"
              description="Preparações próprias registradas no período."
              tiles={[
                counted('Produções', m.productions_total),
                counted('Registradas com atraso', m.productions_late, {
                  of: m.productions_total,
                  tone: 'warning',
                }),
                counted('Porcionamentos', m.production_portionings_total),
                counted('Anulações', m.production_voids_total),
                time(
                  'Tempo até o registro (mediana)',
                  m.production_delay_p50_seconds,
                ),
                time(
                  'Maior tempo até o registro',
                  m.production_delay_max_seconds,
                ),
              ]}
            />
            <Group
              title="Ocorrências e decisões"
              description="Ocorrências abertas e decisões do proprietário no período."
              tiles={[
                counted('Ocorrências', m.occurrences_total),
                counted(
                  'Por manipulação fora da janela',
                  m.occurrences_late_handling,
                  { of: m.occurrences_total },
                ),
                counted(
                  'Por produção fora da janela',
                  m.occurrences_late_production,
                  { of: m.occurrences_total },
                ),
                counted('Ainda sem decisão', m.occurrences_undecided, {
                  of: m.occurrences_total,
                  tone: 'warning',
                }),
                counted('Decisões registradas', m.decisions_total),
                time(
                  'Espera pela decisão (mediana)',
                  m.decision_wait_p50_seconds,
                ),
                time('Maior espera pela decisão', m.decision_wait_max_seconds),
              ]}
            />
            <Group
              title="Armazenamento"
              description="Mudanças de local de recipientes no período."
              tiles={[counted('Mudanças de local', m.location_moves_total)]}
            />
          </div>
          <p className="metrics-footnote">
            Os números contam apenas o que foi registrado no aplicativo. Tempo
            até o registro é a diferença entre o horário informado da operação e
            o horário em que ela foi gravada.
          </p>
        </>
      )}
    </section>
  );
}
