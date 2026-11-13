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
import { getExpiryStatus, localCivilDate } from '../domain/expiryStatus';
import type { MovementGateway } from '../../movements/application/movementGateway';
import { MovementPanel } from '../../movements/components/MovementPanel';

type Props = {
  scope: CatalogScope;
  timezone: string;
  canCreate: boolean;
  catalog: CatalogGateway;
  batches: BatchGateway;
  containers: ContainerGateway;
  catalogRevision?: number;
  userId: string;
  labels?: LabelGateway;
  movements?: MovementGateway;
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
  userId,
  labels,
  movements,
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
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [includeDepleted, setIncludeDepleted] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [now, setNow] = useState(() => new Date());
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

  function reload() {
    setLoadFailed(false);
    setMoreError('');
    setCatalogData(null);
    setListing(null);
    setSummary(null);
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
    (referenceDate === null || summary !== null);
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
    const input = batchInputSchema.safeParse({
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
      setError('Confira produto, fornecedor, quantidade e datas informadas.');
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
      reload();
      setNotice(
        cleaned
          ? 'Recebimento registrado.'
          : 'Recebimento registrado. Não foi possível preparar uma nova tentativa nesta sessão.',
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
        <LabelView key={labelId} id={labelId} gateway={labels} />
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
                            onRecorded={() => refreshRow(row.container_id)}
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
                    <select name="productId" required defaultValue="">
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
                <button disabled={busy}>Registrar recebimento</button>
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
