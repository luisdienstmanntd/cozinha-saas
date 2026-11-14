import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogGateway } from '../../catalog/application/catalogGateway';
import type { CatalogItem, CatalogScope } from '../../catalog/domain/catalog';
import type { BatchGateway } from '../application/batchGateway';
import { batchInputSchema } from '../domain/batch';
import type { ContainerGateway } from '../application/containerGateway';
import type { ContainerPage, ExpirySummary } from '../domain/container';
import type { LabelGateway } from '../../labels/application/labelGateway';
import { LabelView } from '../../labels/components/LabelView';
import {
  EXPIRED_TEXT,
  getExpiryStatus,
  localCivilDate,
} from '../domain/expiryStatus';
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
};
type Catalog = { products: CatalogItem[]; suppliers: CatalogItem[] };
// key: consulta a que a página pertence; página de outra consulta conta como carregando.
type Listing = ContainerPage & { fetchedAt: Date; key: string };
const LOAD_ERROR =
  'Não foi possível carregar todos os recebimentos. Confira o acesso e tente novamente.';
const statusLabels = {
  overdue: 'Vencido',
  today: 'Vence hoje',
  tomorrow: 'Vence amanhã',
  upcoming: 'Posterior',
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
}: Props) {
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
  const [labelId, setLabelId] = useState<string | null>(null);
  const [movementId, setMovementId] = useState<string | null>(null);
  const [handlingId, setHandlingId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Map<string, CurrentLocation>>(new Map());
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [includeDepleted, setIncludeDepleted] = useState(false);
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
    const key = `${attempt}|${includeDepleted}|${query}`;
    void containers
      .list(
        { organizationId, establishmentId },
        { includeDepleted, search: query, after: null },
      )
      .then(
        (page) => {
          if (current && version === listVersion.current)
            setListing({ ...page, fetchedAt: new Date(), key });
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
    includeDepleted,
    query,
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
  function loadMore() {
    if (!listing?.next || listing.key !== listKey || loadingMore) return;
    const version = listVersion.current;
    setLoadingMore(true);
    setMoreError('');
    void containers
      .list(
        { organizationId, establishmentId },
        { includeDepleted, search: query, after: listing.next },
      )
      .then(
        (page) => {
          if (version !== listVersion.current) return;
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

  const listKey = `${attempt}|${includeDepleted}|${query}`;
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
    const temperature = String(values.get('temperature') ?? '').trim();
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
      quantity: values.get('quantity'),
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
          : 'Confira produto, fornecedor, quantidade e datas informadas.',
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
      <h3>Recebimentos de lote</h3>
      {labelId && labels && (
        <LabelView
          key={labelId}
          id={labelId}
          gateway={labels}
          handling={handling}
          canHandle={() => canCreate}
          userId={userId}
          onOpenContainer={setLabelId}
        />
      )}
      {error && <p role="alert">{error}</p>}
      {error === 'Esta tentativa já foi usada com outros dados.' && (
        <div>
          <p>
            Confira a lista de recebimentos antes de iniciar outra tentativa,
            para evitar duplicidade.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setReviewError('');
              const version = ++listVersion.current;
              void containers
                .list(
                  { organizationId, establishmentId },
                  { includeDepleted, search: query, after: null },
                )
                .then(
                  (page) => {
                    if (version === listVersion.current)
                      setListing({
                        ...page,
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
      {!ready && error && <button onClick={reload}>Tentar novamente</button>}
      {ready && !referenceDate && (
        <p role="alert">
          Não foi possível interpretar o fuso do estabelecimento. Atualize o
          acesso ou corrija o fuso.
        </p>
      )}
      {ready && catalogData && referenceDate && summary && (
        <>
          {occurrences && occurrenceRows && (
            <>
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
            </>
          )}
          <section aria-label="Painel de validade">
            <h4>Validade</h4>
            <p>
              Recipientes com saldo, do vencimento mais próximo para o mais
              distante. Recipientes esgotados não entram nas contagens.
            </p>
            <p>
              Fuso: {timezone}. Data de referência: {referenceDate}. Referência:
              relógio deste dispositivo. Novos registros podem exigir
              atualização. Após mudar o fuso da unidade, atualize o acesso.
            </p>
            {shown && (
              <p>
                Última consulta: {shown.fetchedAt.toISOString()} (relógio deste
                dispositivo).
              </p>
            )}
            <button type="button" onClick={reload}>
              Atualizar recebimentos
            </button>
            <p>
              Vencidos: {summary.overdue} · Vence hoje: {summary.due_today} ·{' '}
              Vence amanhã: {summary.due_tomorrow} · Posteriores:{' '}
              {summary.later}
            </p>
            <label>
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
            </label>{' '}
            <label>
              <input
                type="checkbox"
                checked={includeDepleted}
                onChange={(event) => {
                  setMoreError('');
                  setIncludeDepleted(event.target.checked);
                }}
              />{' '}
              Mostrar esgotados
            </label>
          </section>
          {!shown ? (
            <p>Carregando recipientes…</p>
          ) : shown.rows.length === 0 ? (
            <p>
              {query.trim()
                ? 'Nenhum recipiente corresponde à busca.'
                : includeDepleted
                  ? 'Nenhum recebimento registrado.'
                  : 'Nenhum recipiente com saldo.'}
            </p>
          ) : (
            <>
              <ul aria-label="Recipientes e validade">
                {shown.rows.map((row) => {
                  const depleted = row.balance <= 0;
                  const status = getExpiryStatus(
                    row.expiry_date,
                    timezone,
                    now,
                  );
                  // Fatia 6.11: vencido com saldo. O banco recusa o consumo e a manipulação; só o descarte passa.
                  const expired = !depleted && status === 'overdue';
                  return (
                    <li key={row.container_id}>
                      {row.product_name} — {row.short_code}
                      {row.kind === 'derived' && ' (derivado)'} — lote{' '}
                      {row.source_code} — saldo {row.balance} {row.unit} de{' '}
                      {row.initial_quantity} {row.unit} — validade{' '}
                      {row.expiry_date} (
                      {row.expiry_origin === 'handling'
                        ? 'após manipulação'
                        : row.batch_expiry_origin === 'original'
                          ? 'original'
                          : 'definida pelo responsável'}
                      ) — {depleted ? 'Esgotado' : statusLabels[status]} —
                      recipiente {row.container_id}
                      {placed.has(row.container_id) && !depleted && (
                        <>
                          {' '}
                          — local: {placed.get(row.container_id)!.location_name}
                        </>
                      )}
                      {expired && (
                        <strong className="expired-band">
                          {' '}
                          — {EXPIRED_TEXT}
                        </strong>
                      )}
                      {blocked.has(row.container_id) && (
                        <strong>
                          {' '}
                          — {BLOCK_TEXT[blocked.get(row.container_id)!]}
                        </strong>
                      )}
                      {canCreate &&
                        locations &&
                        handling &&
                        !depleted &&
                        !blocked.has(row.container_id) && (
                          <>
                            {' '}
                            <button
                              type="button"
                              onClick={() => setMoveId(row.container_id)}
                            >
                              Mudar de local
                            </button>
                          </>
                        )}
                      {locations && handling && moveId === row.container_id && (
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
                          onMoved={() => loadPlaces()}
                          onClose={() => setMoveId(null)}
                        />
                      )}
                      {movements && row.kind === 'integral' && (
                        <button
                          type="button"
                          onClick={() => setMovementId(row.container_id)}
                        >
                          Ver movimentações
                        </button>
                      )}
                      {movements &&
                        row.kind === 'integral' &&
                        movementId === row.container_id && (
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
                            blocked={blocked.get(row.container_id)}
                            expired={expired}
                            onRecorded={() => {
                              refreshRow(row.container_id);
                              // O descarte pode tirar uma rejeitada da lista de bloqueios.
                              if (blocked.has(row.container_id) && occurrences)
                                void occurrences
                                  .list(
                                    { organizationId, establishmentId },
                                    'open',
                                  )
                                  .then(setOccurrenceRows, () => fail());
                            }}
                          />
                        )}
                      {canCreate &&
                        handling &&
                        !depleted &&
                        !blocked.has(row.container_id) &&
                        !expired && (
                          <>
                            {' '}
                            <button
                              type="button"
                              onClick={() => setHandlingId(row.container_id)}
                            >
                              Abrir / porcionar
                            </button>
                          </>
                        )}
                      {canCreate &&
                        handling &&
                        blocked.has(row.container_id) && (
                          <em>
                            {' '}
                            — manipulação indisponível enquanto o bloqueio durar
                          </em>
                        )}
                      {canCreate &&
                        handling &&
                        expired &&
                        !blocked.has(row.container_id) && (
                          <em> — manipulação indisponível: validade passou</em>
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
                      {canCreate && labels && row.kind === 'integral' && (
                        <>
                          {' '}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setBusy(true);
                              setError('');
                              void labels
                                .ensure(
                                  { organizationId, establishmentId },
                                  row.batch_id,
                                )
                                .then(
                                  (id) => setLabelId(id),
                                  () =>
                                    setError(
                                      'Não foi possível preparar o recipiente. Confira seu acesso.',
                                    ),
                                )
                                .finally(() => setBusy(false));
                            }}
                          >
                            Abrir etiqueta
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              {shown.next && (
                <button type="button" disabled={loadingMore} onClick={loadMore}>
                  Carregar mais recipientes
                </button>
              )}
              {moreError && <p role="alert">{moreError}</p>}
            </>
          )}
          {canCreate && (
            <form onSubmit={(event) => void submit(event)}>
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
                    Conservação: {storageLabels[storage]} (definida no produto)
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
                        Use ponto para decimais, por exemplo -18.5. O sistema
                        registra o valor e não o avalia.
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
                          O recebimento ficará bloqueado para uso até a decisão
                          do responsável.
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
                  A validade deve ser informada ou confirmada pelo profissional
                  responsável.
                </p>
                <button disabled={busy || (!!selectedProduct && !storage)}>
                  Registrar recebimento
                </button>
              </fieldset>
            </form>
          )}
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
