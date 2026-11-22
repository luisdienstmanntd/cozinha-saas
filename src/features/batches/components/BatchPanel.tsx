import { Fragment, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogGateway } from '../../catalog/application/catalogGateway';
import type { CatalogItem, CatalogScope } from '../../catalog/domain/catalog';
import type { BatchGateway } from '../application/batchGateway';
import { batchInputSchema } from '../domain/batch';
import type { ContainerGateway } from '../application/containerGateway';
import type { ContainerPage, ExpirySummary } from '../domain/container';
import {
  EXPIRY_FILTERS,
  expiryFilterLabels,
  expiryFilterStart,
  trimToExpiryFilter,
  type ExpiryFilter,
} from '../domain/expiryFilter';
import { lotText } from '../domain/lot';
import type { LabelGateway } from '../../labels/application/labelGateway';
import { LabelView } from '../../labels/components/LabelView';
import {
  EXPIRED_TEXT,
  expiryBadgeText,
  getExpiryStatus,
  localCivilDate,
} from '../domain/expiryStatus';
import {
  formatCivilDate,
  formatDateTime,
  timezoneLabel,
} from '../../../shared/format/dates';
import type { MovementGateway } from '../../movements/application/movementGateway';
import { MovementPanel } from '../../movements/components/MovementPanel';
import type { OccurrenceGateway } from '../../occurrences/application/occurrenceGateway';
import type { OccurrenceRow } from '../../occurrences/domain/occurrence';
import {
  BLOCK_TEXT,
  blockedContainers,
} from '../../occurrences/domain/occurrence';
import type { HandlingGateway } from '../../handling/application/handlingGateway';
import { HandlingForm } from '../../handling/components/HandlingForm';
import type { LocationGateway } from '../../locations/application/locationGateway';
import { MoveContainer } from '../../locations/components/MoveContainer';
import type { CurrentLocation } from '../../locations/domain/locations';
import { OccurrencePanel } from '../../occurrences/components/OccurrencePanel';
import { storageLabels } from '../../catalog/domain/catalog';
import { useCompactLayout } from '../../../shared/ui/useCompactLayout';
import { MoreInfo } from '../../../shared/ui/MoreInfo';
import {
  formatQuantity,
  quantityProblemText,
  toDotQuantity,
} from '../../../shared/format/quantity';
import { toDotTemperature } from '../../../shared/format/temperature';
import { FirstSteps } from './FirstSteps';
import type { AreaLinks } from './FirstSteps';

type Props = {
  scope: CatalogScope;
  timezone: string;
  canCreate: boolean;
  catalog: CatalogGateway;
  batches: BatchGateway;
  containers: ContainerGateway;
  catalogRevision?: number;
  // Fatia 6.8: muda quando uma tentativa pendente foi conferida ou reenviada; a lista é relida.
  reloadToken?: number;
  userId: string;
  labels?: LabelGateway;
  movements?: MovementGateway;
  occurrences?: OccurrenceGateway;
  // Fatia 6.6: abrir / porcionar a partir da linha (só quem escreve vê o botão).
  handling?: HandlingGateway;
  locations?: LocationGateway;
  // V1: qual parte aparece. Sem o parâmetro, as duas (como antes). A outra continua montada, só oculta,
  // para não perder o que foi digitado ao trocar de área.
  area?: 'validade' | 'receber';
  // V4 (D1): links para as áreas no passo a passo da unidade vazia.
  areaLinks?: AreaLinks;
  // V6 (D-072): filtro da lista pelos contadores. Com `onExpiryFilter`, quem monta o painel guarda o
  // filtro (no endereço); sem ele, o painel guarda sozinho.
  expiryFilter?: ExpiryFilter | null;
  onExpiryFilter?: (filter: ExpiryFilter | null) => void;
};
type Catalog = { products: CatalogItem[]; suppliers: CatalogItem[] };
// key: consulta a que a página pertence; página de outra consulta conta como carregando.
type Listing = ContainerPage & { fetchedAt: Date; key: string };
const LOAD_ERROR =
  'Não foi possível carregar todos os recebimentos. Confira o acesso e tente novamente.';
// V3 (B4): o selo usa cor e símbolo, mas o texto sempre diz o status (não depende só da cor).
const badgeSymbols = {
  overdue: '⛔',
  today: '⚠',
  tomorrow: '●',
  upcoming: '✓',
  depleted: '○',
} as const;

function BatchContents({
  scope: { organizationId, establishmentId },
  timezone,
  canCreate,
  catalog,
  batches,
  containers,
  catalogRevision,
  reloadToken,
  userId,
  labels,
  movements,
  occurrences,
  handling,
  locations,
  area,
  areaLinks,
  expiryFilter,
  onExpiryFilter,
}: Props) {
  const compact = useCompactLayout();
  const showValidade = area === undefined || area === 'validade';
  const showReceber = area === undefined || area === 'receber';
  const [catalogData, setCatalogData] = useState<Catalog | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [summary, setSummary] = useState<ExpirySummary | null>(null);
  // Uma consulta falhou: nada do painel aparece até nova tentativa, mesmo que outra consulta chegue depois.
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [origin, setOrigin] = useState('original');
  const [conflictReviewed, setConflictReviewed] = useState(false);
  const [reviewError, setReviewError] = useState('');
  // V3 (M6): ficha do recipiente aberta a partir do cartão. A lista fica oculta (não desmontada), e
  // "Voltar para a lista" devolve o foco ao cartão de onde a pessoa saiu.
  const [labelId, setLabelId] = useState<string | null>(null);
  const [labelFrom, setLabelFrom] = useState<string | null>(null);
  const [movementId, setMovementId] = useState<string | null>(null);
  const [handlingId, setHandlingId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  // V4 (M10): depois de mudar de local, o formulário fecha e a confirmação fica no cartão.
  const [movedId, setMovedId] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Map<string, CurrentLocation>>(new Map());
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [includeDepleted, setIncludeDepleted] = useState(false);
  const [localFilter, setLocalFilter] = useState<ExpiryFilter | null>(null);
  const filter = onExpiryFilter ? (expiryFilter ?? null) : localFilter;
  const chooseFilter = onExpiryFilter ?? setLocalFilter;
  const [moreError, setMoreError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [occurrenceRows, setOccurrenceRows] = useState<OccurrenceRow[] | null>(
    null,
  );
  const [decidedRows, setDecidedRows] = useState<OccurrenceRow[] | null>(null);
  const [showDecided, setShowDecided] = useState(false);
  const [productId, setProductId] = useState('');
  const [temperatureStatus, setTemperatureStatus] = useState('');
  const intent = useRef<string | null>(null);
  const listVersion = useRef(0);
  let referenceDate: string | null = null;
  try {
    referenceDate = localCivilDate(now, timezone);
  } catch {
    /* Fuso inválido: exibir erro sem classificar. */
  }
  // V6: o filtro usa a mesma data de referência das contagens; sem data válida, não filtra.
  const activeFilter = referenceDate ? filter : null;
  const filterDate = activeFilter ? referenceDate : null;
  // As contagens só contam recipientes com saldo; com filtro, os esgotados ficam fora.
  const listDepleted = includeDepleted && !activeFilter;
  const filterKey = activeFilter ? `${activeFilter}@${filterDate}` : '';
  // Filtro novo (inclusive vindo do endereço) esconde os esgotados; ajuste durante a renderização.
  const [seenFilter, setSeenFilter] = useState(filter);
  if (filter !== seenFilter) {
    setSeenFilter(filter);
    if (filter) setIncludeDepleted(false);
  }
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 60000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  // A busca vai ao servidor; espera a digitação parar para não consultar a cada tecla.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  function fail() {
    setCatalogData(null);
    setListing(null);
    setSummary(null);
    setOccurrenceRows(null);
    setDecidedRows(null);
    setLabelId(null);
    setMovementId(null);
    setLoadFailed(true);
    setError(LOAD_ERROR);
  }
  useEffect(() => {
    let current = true;
    const scope = { organizationId, establishmentId };
    void Promise.all([
      catalog.list('products', scope),
      catalog.list('suppliers', scope),
    ]).then(
      ([products, suppliers]) => {
        if (current) setCatalogData({ products, suppliers });
      },
      () => {
        if (current) fail();
      },
    );
    return () => {
      current = false;
    };
  }, [attempt, catalog, establishmentId, organizationId, catalogRevision]);
  useEffect(() => {
    let current = true;
    const version = ++listVersion.current;
    const key = `${attempt}|${listDepleted}|${query}|${filterKey}`;
    void containers
      .list(
        { organizationId, establishmentId },
        {
          includeDepleted: listDepleted,
          search: query,
          after:
            activeFilter && filterDate
              ? expiryFilterStart(activeFilter, filterDate)
              : null,
        },
      )
      .then(
        (page) => {
          if (current && version === listVersion.current)
            setListing({
              ...(activeFilter && filterDate
                ? trimToExpiryFilter(activeFilter, filterDate, page)
                : page),
              fetchedAt: new Date(),
              key,
            });
        },
        () => {
          if (current) fail();
        },
      );
    return () => {
      current = false;
    };
  }, [
    attempt,
    containers,
    establishmentId,
    organizationId,
    listDepleted,
    query,
    activeFilter,
    filterDate,
    filterKey,
  ]);
  useEffect(() => {
    if (!referenceDate) return;
    let current = true;
    void containers
      .summary({ organizationId, establishmentId }, referenceDate)
      .then(
        (value) => {
          if (current) setSummary(value);
        },
        () => {
          if (current) fail();
        },
      );
    return () => {
      current = false;
    };
  }, [attempt, containers, establishmentId, organizationId, referenceDate]);
  // Fatia 6.5b: ocorrências abertas (bloqueios) da unidade, lidas do servidor a cada atualização.
  useEffect(() => {
    if (!occurrences) return;
    let current = true;
    void occurrences.list({ organizationId, establishmentId }, 'open').then(
      (rows) => {
        if (current) setOccurrenceRows(rows);
      },
      () => {
        if (current) fail();
      },
    );
    return () => {
      current = false;
    };
  }, [attempt, occurrences, establishmentId, organizationId]);
  useEffect(() => {
    if (!occurrences || !showDecided) return;
    let current = true;
    void occurrences.list({ organizationId, establishmentId }, 'all').then(
      (rows) => {
        if (current) setDecidedRows(rows);
      },
      () => {
        if (current) fail();
      },
    );
    return () => {
      current = false;
    };
  }, [attempt, occurrences, establishmentId, organizationId, showDecided]);

  function loadPlaces() {
    if (!locations) return () => undefined;
    let current = true;
    void locations.currents({ organizationId, establishmentId }).then(
      (rows) => {
        if (current)
          setPlaced(new Map(rows.map((row) => [row.container_id, row])));
      },
      // Os locais são informação extra: sem eles a lista continua funcionando.
      () => {
        if (current) setPlaced(new Map());
      },
    );
    return () => {
      current = false;
    };
  }
  useEffect(loadPlaces, [attempt, locations, establishmentId, organizationId]);

  const firstToken = useRef(reloadToken);
  useEffect(() => {
    if (reloadToken === firstToken.current) return;
    firstToken.current = reloadToken;
    reload();
  }, [reloadToken]);
  function reload() {
    setLoadFailed(false);
    setMoreError('');
    setCatalogData(null);
    setListing(null);
    setSummary(null);
    setOccurrenceRows(null);
    setDecidedRows(null);
    setLabelId(null);
    setMovementId(null);
    setError('');
    setNow(new Date());
    setAttempt((value) => value + 1);
  }
  function openFicha(containerId: string) {
    setLabelFrom(containerId);
    setLabelId(containerId);
    window.scrollTo?.({ top: 0 });
  }
  function closeFicha() {
    const from = labelFrom;
    setLabelId(null);
    setLabelFrom(null);
    if (from)
      window.setTimeout(() =>
        document
          .querySelector<HTMLElement>(`[data-ficha-for="${from}"]`)
          ?.focus(),
      );
  }
  function loadMore() {
    if (!listing?.next || listing.key !== listKey || loadingMore) return;
    const version = listVersion.current;
    setLoadingMore(true);
    setMoreError('');
    void containers
      .list(
        { organizationId, establishmentId },
        { includeDepleted: listDepleted, search: query, after: listing.next },
      )
      .then(
        (received) => {
          if (version !== listVersion.current) return;
          const page =
            activeFilter && filterDate
              ? trimToExpiryFilter(activeFilter, filterDate, received)
              : received;
          setListing((previous) =>
            previous
              ? {
                  ...previous,
                  rows: [...previous.rows, ...page.rows],
                  next: page.next,
                }
              : previous,
          );
        },
        () => {
          if (version === listVersion.current)
            setMoreError(
              'Não foi possível carregar mais recipientes. Tente novamente.',
            );
        },
      )
      .finally(() => setLoadingMore(false));
  }
  // Depois de uma saída ou anulação, relê o saldo daquele recipiente e as contagens.
  function refreshRow(containerId: string) {
    const scope = { organizationId, establishmentId };
    void containers.get(scope, containerId).then(
      (row) =>
        setListing((previous) =>
          previous
            ? {
                ...previous,
                rows: previous.rows.map((item) =>
                  item.container_id === containerId && row ? row : item,
                ),
              }
            : previous,
        ),
      () => fail(),
    );
    if (referenceDate)
      void containers
        .summary(scope, referenceDate)
        .then(setSummary, () => fail());
  }

  const listKey = `${attempt}|${listDepleted}|${query}|${filterKey}`;
  function toggleFilter(next: ExpiryFilter) {
    setMoreError('');
    if (next !== filter) setIncludeDepleted(false);
    chooseFilter(next === filter ? null : next);
  }
  const filterCounts: Record<ExpiryFilter, keyof ExpirySummary> = {
    vencidos: 'overdue',
    hoje: 'due_today',
    amanha: 'due_tomorrow',
    posteriores: 'later',
  };
  const tileTones: Record<ExpiryFilter, string> = {
    vencidos: 'tone-overdue',
    hoje: 'tone-today',
    amanha: 'tone-tomorrow',
    posteriores: 'tone-upcoming',
  };
  const shown = listing?.key === listKey ? listing : null;
  const ready =
    !loadFailed &&
    catalogData !== null &&
    (!occurrences || occurrenceRows !== null) &&
    (referenceDate === null || summary !== null);
  const blocked = blockedContainers(occurrenceRows ?? []);
  const selectedProduct = catalogData?.products.find(
    (item) => item.id === productId,
  );
  const storage = selectedProduct?.storage_condition ?? null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      values = new FormData(form);
    const expiry = String(values.get('expiryDate') ?? '');
    const storageKey = `batch-intent:${userId}:${organizationId}:${establishmentId}`;
    try {
      intent.current ??=
        sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
    } catch {
      setError('Não foi possível preparar o reenvio seguro nesta sessão.');
      return;
    }
    if (!storage) {
      setNotice('');
      setError(
        'Defina a conservação deste produto no catálogo antes de receber.',
      );
      return;
    }
    // V5B (D-064): vírgula ou ponto; a validação de sempre (-50 a 80 °C, uma casa) vale sobre a forma com ponto.
    const temperature = toDotTemperature(
      String(values.get('temperature') ?? ''),
    );
    const status =
      storage === 'ambient'
        ? temperature
          ? 'measured'
          : 'not_required'
        : temperatureStatus;
    const input = batchInputSchema.safeParse({
      storageCondition: storage,
      temperatureStatus: status,
      receivedTemperatureC: status === 'measured' ? temperature : null,
      temperatureReason:
        status === 'not_measured'
          ? String(values.get('temperatureReason') ?? '').trim() || null
          : null,
      productId: values.get('productId'),
      supplierId: values.get('supplierId'),
      sourceCode: values.get('sourceCode'),
      // V5 (D-063): vírgula ou ponto decimal; o esquema de sempre recebe a forma com ponto.
      quantity: toDotQuantity(String(values.get('quantity') ?? '')) ?? '',
      expiryDate: expiry,
      expiryOrigin: origin,
      originalExpiryDate:
        origin === 'original'
          ? expiry
          : values.get('originalExpiryDate') || null,
      intentId: intent.current,
    });
    setError('');
    setNotice('');
    setConflictReviewed(false);
    setReviewError('');
    if (!input.success) {
      setError(
        input.error.issues.some((issue) => issue.message === 'temperature') ||
          input.error.issues.some((issue) =>
            [
              'receivedTemperatureC',
              'temperatureReason',
              'temperatureStatus',
            ].includes(String(issue.path[0])),
          )
          ? 'Confira a temperatura: informe a medida em °C (de -50 a 80, uma casa decimal) ou, se não foi possível medir, a justificativa.'
          : // V5 (D-063): separador de milhar ou "1.500" (ambíguo) têm mensagem própria.
            (quantityProblemText(String(values.get('quantity') ?? '')) ??
              'Confira produto, fornecedor, quantidade e datas informadas.'),
      );
      return;
    }
    try {
      sessionStorage.setItem(storageKey, intent.current);
    } catch {
      setError('Não foi possível preparar o reenvio seguro nesta sessão.');
      return;
    }
    setBusy(true);
    try {
      await batches.receive({ organizationId, establishmentId }, input.data);
      let cleaned = true;
      try {
        if (sessionStorage.getItem(storageKey) === input.data.intentId)
          sessionStorage.removeItem(storageKey);
      } catch {
        cleaned = false;
      }
      intent.current = null;
      form.reset();
      setOrigin('original');
      setProductId('');
      setTemperatureStatus('');
      reload();
      const held =
        input.data.temperatureStatus === 'not_measured'
          ? ' O recebimento ficou bloqueado para uso até a decisão do proprietário.'
          : '';
      setNotice(
        cleaned
          ? `Recebimento registrado.${held}`
          : `Recebimento registrado.${held} Não foi possível preparar uma nova tentativa nesta sessão.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha no registro.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Recebimentos de lote">
      {showReceber && (
        <header className="operation-heading">
          <h3>Recebimentos de lote</h3>
        </header>
      )}
      <div hidden={!showValidade}>
        {labelId && labels && (
          <div className="container-ficha">
            <button type="button" className="secondary" onClick={closeFicha}>
              ← Voltar para a lista
            </button>
            <LabelView
              key={labelId}
              id={labelId}
              gateway={labels}
              handling={handling}
              canHandle={() => canCreate}
              userId={userId}
              onOpenContainer={setLabelId}
            />
          </div>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {error === 'Esta tentativa já foi usada com outros dados.' && (
        <div>
          <p>
            Confira a lista de recebimentos antes de iniciar outra tentativa,
            para evitar duplicidade.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setReviewError('');
              const version = ++listVersion.current;
              void containers
                .list(
                  { organizationId, establishmentId },
                  {
                    includeDepleted: listDepleted,
                    search: query,
                    after:
                      activeFilter && filterDate
                        ? expiryFilterStart(activeFilter, filterDate)
                        : null,
                  },
                )
                .then(
                  (page) => {
                    if (version === listVersion.current)
                      setListing({
                        ...(activeFilter && filterDate
                          ? trimToExpiryFilter(activeFilter, filterDate, page)
                          : page),
                        fetchedAt: new Date(),
                        key: listKey,
                      });
                    setConflictReviewed(true);
                  },
                  () =>
                    setReviewError(
                      'Não foi possível atualizar a lista. Tente novamente.',
                    ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Atualizar lista para conferência
          </button>
          {reviewError && <p role="alert">{reviewError}</p>}
          <button
            type="button"
            disabled={!conflictReviewed || busy}
            onClick={() => {
              try {
                sessionStorage.removeItem(
                  `batch-intent:${userId}:${organizationId}:${establishmentId}`,
                );
                intent.current = null;
                setError('');
              } catch {
                setError(
                  'Não foi possível preparar o reenvio seguro nesta sessão.',
                );
              }
            }}
          >
            Já conferi; iniciar nova tentativa
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {!ready && !error && <p>Carregando recebimentos…</p>}
      {!ready && error && (
        <button className="secondary" onClick={reload}>
          Tentar novamente
        </button>
      )}
      {ready && !referenceDate && (
        <p role="alert">
          Não foi possível interpretar o fuso do estabelecimento. Atualize o
          acesso ou corrija o fuso.
        </p>
      )}
      {ready && catalogData && referenceDate && summary && (
        <>
          <div hidden={!showValidade || (!!labelId && !!labels)}>
            <section aria-label="Painel de validade" className="expiry-panel">
              <h4>Validade</h4>
              {occurrenceRows && occurrenceRows.length > 0 && (
                <p className="blocked-band blocks-notice">
                  <strong>
                    {occurrenceRows.length === 1
                      ? '1 ocorrência aberta'
                      : `${occurrenceRows.length} ocorrências abertas`}
                  </strong>{' '}
                  com recipiente bloqueado.{' '}
                  <a href="#bloqueios">Ver bloqueios e ocorrências</a>
                </p>
              )}
              <div
                role="group"
                aria-label="Resumo de validade"
                className="expiry-summary"
              >
                {/* V6 (D-072): cada contador filtra a lista; tocar de novo volta à lista completa. */}
                {EXPIRY_FILTERS.map((item) => (
                  <Fragment key={item}>
                    <button
                      type="button"
                      className={`tile tile-filter ${tileTones[item]}`}
                      aria-pressed={activeFilter === item}
                      onClick={() => toggleFilter(item)}
                    >
                      <span className="tile-label">
                        {expiryFilterLabels[item]}:
                      </span>{' '}
                      <strong className="tile-count">
                        {summary[filterCounts[item]]}
                      </strong>
                    </button>{' '}
                  </Fragment>
                ))}
              </div>
              {activeFilter && (
                <p className="expiry-filter-status" role="status">
                  Mostrando: {expiryFilterLabels[activeFilter]} (
                  {summary[filterCounts[activeFilter]]} com saldo na unidade)
                  {query.trim()
                    ? ', com a busca aplicada dentro do filtro'
                    : ''}
                  .{' '}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setMoreError('');
                      chooseFilter(null);
                    }}
                  >
                    Limpar filtro
                  </button>
                </p>
              )}
              <div className="expiry-tools">
                <label className="expiry-search">
                  Buscar por produto, lote, código ou ID do recipiente{' '}
                  <input
                    type="search"
                    aria-label="Buscar por produto, lote, código ou ID do recipiente"
                    value={search}
                    maxLength={120}
                    onChange={(event) => {
                      setMoreError('');
                      setSearch(event.target.value);
                    }}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={listDepleted}
                    onChange={(event) => {
                      setMoreError('');
                      // V6: as contagens não incluem esgotados, então mostrá-los limpa o filtro.
                      if (event.target.checked && filter) chooseFilter(null);
                      setIncludeDepleted(event.target.checked);
                    }}
                  />{' '}
                  Mostrar esgotados
                </label>
                <button type="button" className="secondary" onClick={reload}>
                  Atualizar recebimentos
                </button>
              </div>
            </section>
            {!shown ? (
              <p>Carregando recipientes…</p>
            ) : shown.rows.length === 0 ? (
              <>
                <p>
                  {activeFilter
                    ? query.trim()
                      ? 'Nenhum recipiente desta categoria corresponde à busca.'
                      : 'Nenhum recipiente com saldo nesta categoria.'
                    : query.trim()
                      ? 'Nenhum recipiente corresponde à busca.'
                      : listDepleted
                        ? 'Nenhum recebimento registrado.'
                        : 'Nenhum recipiente com saldo.'}
                </p>
                {!query.trim() && !activeFilter && (
                  <FirstSteps
                    owner={canCreate}
                    hasProducts={catalogData.products.length > 0}
                    hasSuppliers={catalogData.suppliers.length > 0}
                    hasLocations={!!locations}
                    links={areaLinks}
                  />
                )}
              </>
            ) : (
              <>
                <ul
                  aria-label="Recipientes e validade"
                  className="container-cards"
                >
                  {shown.rows.map((row) => {
                    const depleted = row.balance <= 0;
                    const status = getExpiryStatus(
                      row.expiry_date,
                      timezone,
                      now,
                    );
                    // Fatia 6.11: vencido com saldo. O banco recusa o consumo e a manipulação; só o descarte passa.
                    const expired = !depleted && status === 'overdue';
                    const tone = depleted ? 'depleted' : status;
                    const isBlocked = blocked.has(row.container_id);
                    const place = depleted
                      ? undefined
                      : placed.get(row.container_id);
                    const titleId = `cartao-${row.container_id}`;
                    return (
                      <li
                        key={row.container_id}
                        className={`container-card tone-${tone}`}
                        aria-labelledby={titleId}
                      >
                        <div className="card-head">
                          <p className="card-title" id={titleId}>
                            <strong className="card-product">
                              {row.product_name}
                            </strong>{' '}
                            <span className="card-code">{row.short_code}</span>
                            {row.kind === 'derived' && (
                              <span className="card-tag"> (derivado)</span>
                            )}{' '}
                            <span className="card-lot">
                              · {lotText(row.source_code)}
                            </span>
                          </p>{' '}
                          <span className={`expiry-badge tone-${tone}`}>
                            <span aria-hidden="true">{badgeSymbols[tone]}</span>{' '}
                            {depleted
                              ? 'Esgotado'
                              : expiryBadgeText(row.expiry_date, timezone, now)}
                          </span>
                        </div>{' '}
                        <dl className="card-facts">
                          <div className="fact-expiry">
                            <dt>Validade</dt>{' '}
                            <dd>
                              <strong>
                                {formatCivilDate(row.expiry_date)}
                              </strong>{' '}
                              <span className="fact-note">
                                (
                                {row.expiry_origin === 'handling'
                                  ? 'após manipulação'
                                  : row.batch_expiry_origin === 'original'
                                    ? 'original'
                                    : 'definida pelo responsável'}
                                )
                              </span>
                            </dd>
                          </div>{' '}
                          <div className="fact-balance">
                            <dt>Saldo</dt>{' '}
                            <dd>
                              <strong>
                                {formatQuantity(row.balance)} {row.unit}
                              </strong>{' '}
                              de {formatQuantity(row.initial_quantity)}{' '}
                              {row.unit}
                            </dd>
                          </div>
                          {place && (
                            <>
                              {' '}
                              <div>
                                <dt>Local</dt> <dd>{place.location_name}</dd>
                              </div>
                            </>
                          )}
                        </dl>{' '}
                        {expired && (
                          <p className="expired-band card-band">
                            <strong>{EXPIRED_TEXT}</strong>
                          </p>
                        )}
                        {isBlocked && (
                          <p className="blocked-band card-band">
                            <strong>
                              {BLOCK_TEXT[blocked.get(row.container_id)!]}
                            </strong>
                          </p>
                        )}
                        {canCreate && handling && isBlocked && (
                          <p className="card-note">
                            <em>
                              Manipulação indisponível enquanto o bloqueio
                              durar.
                            </em>
                          </p>
                        )}
                        {canCreate && handling && expired && !isBlocked && (
                          <p className="card-note">
                            <em>Manipulação indisponível: validade passou.</em>
                          </p>
                        )}
                        {movedId === row.container_id && (
                          <p
                            className="card-status"
                            role="status"
                            tabIndex={-1}
                            ref={(node) => node?.focus()}
                          >
                            Local registrado.
                          </p>
                        )}
                        {(() => {
                          // V4 (M1 e item 7): "Abrir / porcionar" é a ação principal do cartão; as demais
                          // são secundárias. No celular, "Ver ficha" e a principal ficam à vista e o resto vai
                          // para "Mais ações". Sem ação principal (vencido, bloqueado, esgotado ou
                          // colaborador), "Ver movimentações" fica à vista, porque é por ela que se descarta.
                          const canHandle =
                            canCreate &&
                            !!handling &&
                            !depleted &&
                            !isBlocked &&
                            !expired;
                          const ficha = labels ? (
                            <button
                              key="ficha"
                              type="button"
                              className="secondary"
                              data-ficha-for={row.container_id}
                              onClick={() => openFicha(row.container_id)}
                            >
                              Ver ficha
                            </button>
                          ) : null;
                          // D-073 (etapa 2): porções e derivados também têm histórico e saída.
                          const history = movements ? (
                            <button
                              key="history"
                              type="button"
                              className="secondary"
                              onClick={() => setMovementId(row.container_id)}
                            >
                              Ver movimentações
                            </button>
                          ) : null;
                          const main = canHandle ? (
                            <button
                              key="handle"
                              type="button"
                              onClick={() => setHandlingId(row.container_id)}
                            >
                              {row.source_code === null
                                ? 'Porcionar'
                                : 'Abrir / porcionar'}
                            </button>
                          ) : null;
                          const move =
                            canCreate &&
                            locations &&
                            handling &&
                            !depleted &&
                            !isBlocked ? (
                              <button
                                key="move"
                                type="button"
                                className="secondary"
                                onClick={() => {
                                  setMovedId(null);
                                  setMoveId(row.container_id);
                                }}
                              >
                                Mudar de local
                              </button>
                            ) : null;
                          const inline = compact
                            ? main
                              ? [ficha, main]
                              : [ficha, history]
                            : [ficha, history, main, move];
                          const extra = compact
                            ? main
                              ? [history, move]
                              : [move]
                            : [];
                          const hidden = extra.filter(Boolean);
                          return (
                            <div className="card-actions">
                              {inline.filter(Boolean)}
                              {hidden.length > 0 && (
                                <details className="more-actions">
                                  <summary>
                                    Mais ações
                                    <span className="visually-hidden">
                                      {' '}
                                      do recipiente {row.short_code}
                                    </span>
                                  </summary>
                                  <div className="more-actions-list">
                                    {hidden}
                                  </div>
                                </details>
                              )}
                            </div>
                          );
                        })()}
                        {locations &&
                          handling &&
                          moveId === row.container_id && (
                            <MoveContainer
                              key={row.container_id}
                              scope={{ organizationId, establishmentId }}
                              containerId={row.container_id}
                              userId={userId}
                              gateway={locations}
                              loadMembers={(target) => handling.members(target)}
                              setDisplayName={(target, id, name) =>
                                handling.setDisplayName(target, id, name)
                              }
                              current={placed.get(row.container_id)}
                              onMoved={() => {
                                loadPlaces();
                                setMoveId(null);
                                setMovedId(row.container_id);
                              }}
                              onClose={() => setMoveId(null)}
                            />
                          )}
                        {movements && movementId === row.container_id && (
                          <MovementPanel
                            key={row.container_id}
                            scope={{ organizationId, establishmentId }}
                            userId={userId}
                            batch={{
                              id: row.batch_id,
                              productName: row.product_name,
                              sourceCode: row.source_code,
                              quantity: row.initial_quantity,
                              unit: row.unit,
                            }}
                            canCreate={canCreate}
                            gateway={movements}
                            loadMembers={handling?.members}
                            blocked={blocked.get(row.container_id)}
                            expired={expired}
                            containerId={
                              row.kind === 'derived'
                                ? row.container_id
                                : undefined
                            }
                            onRecorded={() => {
                              refreshRow(row.container_id);
                              // O descarte pode tirar uma rejeitada da lista de bloqueios.
                              if (isBlocked && occurrences)
                                void occurrences
                                  .list(
                                    { organizationId, establishmentId },
                                    'open',
                                  )
                                  .then(setOccurrenceRows, () => fail());
                            }}
                          />
                        )}
                        {handling && handlingId === row.container_id && (
                          <HandlingForm
                            key={row.container_id}
                            scope={{ organizationId, establishmentId }}
                            containerId={row.container_id}
                            userId={userId}
                            gateway={handling}
                            labels={labels}
                            onChanged={() => refreshRow(row.container_id)}
                            onClose={() => {
                              setHandlingId(null);
                              reload();
                            }}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
                {shown.next && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={loadingMore}
                    onClick={loadMore}
                  >
                    Carregar mais recipientes
                  </button>
                )}
                {moreError && <p role="alert">{moreError}</p>}
              </>
            )}
            {/* V3: a explicação da ordem e da data de referência fica logo abaixo da lista (texto preservado). */}
            {/* V4 (M11): a data de referência e o fuso definem como os selos de validade são calculados,
                então ficam sempre à vista (texto da V3, sem mudança). Só a explicação da ordem da lista vai
                para "Saiba mais" (texto preservado, só recolhido). */}
            <div className="expiry-notes">
              <p className="expiry-reference">
                Data de referência: {formatCivilDate(referenceDate)}. Fuso:{' '}
                {timezoneLabel(timezone, now)}. Referência: relógio deste
                dispositivo. Novos registros podem exigir atualização. Após
                mudar o fuso da unidade, atualize o acesso.
                {shown && (
                  <>
                    {' '}
                    Última consulta: {formatDateTime(
                      shown.fetchedAt,
                      timezone,
                    )}{' '}
                    (relógio deste dispositivo).
                  </>
                )}
              </p>
              <MoreInfo summary="Saiba mais sobre a ordem da lista">
                <p>
                  Recipientes com saldo, do vencimento mais próximo para o mais
                  distante. Recipientes esgotados não entram nas contagens.
                </p>
              </MoreInfo>
            </div>
            {/* V3: no celular a lista vem primeiro; o painel completo de bloqueios fica logo depois,
                com aviso e atalho no alto do painel de validade. */}
            {occurrences && occurrenceRows && (
              <div id="bloqueios" className="blocks-after-list">
                <OccurrencePanel
                  rows={occurrenceRows}
                  decided={showDecided ? decidedRows : null}
                  scope={{ organizationId, establishmentId }}
                  gateway={occurrences}
                  canDecide={canCreate}
                  now={now}
                  onDecided={(message) => {
                    reload();
                    setNotice(message);
                  }}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={showDecided}
                    onChange={(event) => {
                      setDecidedRows(null);
                      setShowDecided(event.target.checked);
                    }}
                  />{' '}
                  Mostrar todas as ocorrências, inclusive decididas
                </label>
                {showDecided && !decidedRows && <p>Carregando ocorrências…</p>}
              </div>
            )}
          </div>
          <div hidden={!showReceber}>
            {canCreate && (
              <form
                className="receipt-form"
                onSubmit={(event) => void submit(event)}
              >
                <fieldset disabled={busy}>
                  <p>
                    <label>
                      Produto{' '}
                      <select
                        name="productId"
                        required
                        value={productId}
                        onChange={(event) => {
                          setProductId(event.target.value);
                          setTemperatureStatus('');
                        }}
                      >
                        <option value="" disabled>
                          Selecione
                        </option>
                        {catalogData.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.unit})
                          </option>
                        ))}
                      </select>
                    </label>
                  </p>
                  {selectedProduct && !storage && (
                    <p role="alert">
                      Defina a conservação deste produto no catálogo antes de
                      receber.
                    </p>
                  )}
                  {storage && (
                    <p>
                      Conservação: {storageLabels[storage]} (definida no
                      produto)
                    </p>
                  )}
                  {storage === 'ambient' && (
                    <p>
                      <label>
                        Temperatura medida no recebimento, em °C (opcional){' '}
                        <input
                          name="temperature"
                          inputMode="decimal"
                          maxLength={5}
                        />
                      </label>
                    </p>
                  )}
                  {(storage === 'refrigerated' || storage === 'frozen') && (
                    <fieldset>
                      <legend>Temperatura no recebimento</legend>
                      <label>
                        <input
                          type="radio"
                          name="temperatureStatus"
                          value="measured"
                          checked={temperatureStatus === 'measured'}
                          onChange={() => setTemperatureStatus('measured')}
                        />{' '}
                        Temperatura medida
                      </label>{' '}
                      <label>
                        <input
                          type="radio"
                          name="temperatureStatus"
                          value="not_measured"
                          checked={temperatureStatus === 'not_measured'}
                          onChange={() => setTemperatureStatus('not_measured')}
                        />{' '}
                        Não foi possível medir
                      </label>
                      {temperatureStatus === 'measured' && (
                        <p>
                          <label>
                            Temperatura medida, em °C{' '}
                            <input
                              name="temperature"
                              required
                              inputMode="decimal"
                              maxLength={5}
                            />
                          </label>{' '}
                          Use vírgula ou ponto para decimais, por exemplo -18,5.
                          O sistema registra o valor e não o avalia.
                        </p>
                      )}
                      {temperatureStatus === 'not_measured' && (
                        <>
                          <p>
                            <label>
                              Justificativa (por que não foi possível medir){' '}
                              <textarea
                                name="temperatureReason"
                                required
                                maxLength={300}
                              />
                            </label>
                          </p>
                          <p role="note">
                            O recebimento ficará bloqueado para uso até a
                            decisão do responsável.
                          </p>
                        </>
                      )}
                    </fieldset>
                  )}
                  <p>
                    <label>
                      Fornecedor{' '}
                      <select name="supplierId" required defaultValue="">
                        <option value="" disabled>
                          Selecione
                        </option>
                        {catalogData.suppliers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </p>
                  <p>
                    <label>
                      Lote de origem{' '}
                      <input name="sourceCode" required maxLength={120} />
                    </label>
                  </p>
                  <p>
                    <label>
                      Quantidade recebida{' '}
                      <input name="quantity" required inputMode="decimal" />
                    </label>
                  </p>
                  <p>
                    <label>
                      Origem da validade{' '}
                      <select
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                      >
                        <option value="original">Original</option>
                        <option value="responsible">
                          Definida pelo responsável
                        </option>
                      </select>
                    </label>
                  </p>
                  <p>
                    <label>
                      Data de validade{' '}
                      <input name="expiryDate" type="date" required />
                    </label>
                  </p>
                  {origin === 'responsible' && (
                    <p>
                      <label>
                        Validade original, se conhecida{' '}
                        <input name="originalExpiryDate" type="date" />
                      </label>
                    </p>
                  )}
                  <p>
                    A validade deve ser informada ou confirmada pelo
                    profissional responsável.
                  </p>
                  <button disabled={busy || (!!selectedProduct && !storage)}>
                    Registrar recebimento
                  </button>
                </fieldset>
              </form>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function BatchPanel(props: Props) {
  return (
    <BatchContents
      key={`${props.scope.organizationId}:${props.scope.establishmentId}`}
      {...props}
    />
  );
}
