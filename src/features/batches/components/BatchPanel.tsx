import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogGateway } from '../../catalog/application/catalogGateway';
import type { CatalogItem, CatalogScope } from '../../catalog/domain/catalog';
import type { BatchGateway } from '../application/batchGateway';
import { batchInputSchema } from '../domain/batch';
import type { BatchRow } from '../domain/batch';
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
  catalogRevision?: number;
  userId: string;
  labels?: LabelGateway;
  movements?: MovementGateway;
};
type Loaded = {
  products: CatalogItem[];
  suppliers: CatalogItem[];
  rows: BatchRow[];
  fetchedAt: Date;
};

function BatchContents({
  scope: { organizationId, establishmentId },
  timezone,
  canCreate,
  catalog,
  batches,
  catalogRevision,
  userId,
  labels,
  movements,
}: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
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
  const [now, setNow] = useState(() => new Date());
  const intent = useRef<string | null>(null);
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
  useEffect(() => {
    let current = true;
    const scope = { organizationId, establishmentId };
    void Promise.all([
      catalog.list('products', scope),
      catalog.list('suppliers', scope),
      batches.list(scope),
    ]).then(
      ([products, suppliers, rows]) => {
        if (current)
          setLoaded({ products, suppliers, rows, fetchedAt: new Date() });
      },
      (cause: unknown) => {
        if (current) {
          setLoaded(null);
          setLabelId(null);
          setMovementId(null);
          setError(
            cause instanceof Error &&
              cause.message ===
                'O limite de 10.000 recebimentos foi excedido; a consulta não foi exibida.'
              ? cause.message
              : 'Não foi possível carregar todos os recebimentos. Confira o acesso e tente novamente.',
          );
        }
      },
    );
    return () => {
      current = false;
    };
  }, [
    attempt,
    batches,
    catalog,
    establishmentId,
    organizationId,
    catalogRevision,
  ]);

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
      setLoaded(null);
      setAttempt((value) => value + 1);
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
              void batches
                .list({ organizationId, establishmentId })
                .then(
                  (rows) => {
                    setLoaded((previous) =>
                      previous
                        ? { ...previous, rows, fetchedAt: new Date() }
                        : previous,
                    );
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
      {!loaded && !error && <p>Carregando recebimentos…</p>}
      {!loaded && error && (
        <button
          onClick={() => {
            setError('');
            setAttempt((v) => v + 1);
          }}
        >
          Tentar novamente
        </button>
      )}
      {loaded && !referenceDate && (
        <p role="alert">
          Não foi possível interpretar o fuso do estabelecimento. Atualize o
          acesso ou corrija o fuso.
        </p>
      )}
      {loaded && referenceDate && (
        <>
          <section aria-label="Painel de validade">
            <h4>Validade</h4>
            <p>
              Contagens de recebimentos registrados; não representam saldo
              disponível.
            </p>
            <p>
              Fuso: {timezone}. Data de referência: {referenceDate}. Referência:
              relógio deste dispositivo. Novos registros podem exigir
              atualização. Após mudar o fuso da unidade, atualize o acesso.
            </p>
            <p>
              Última consulta: {loaded.fetchedAt.toISOString()} (relógio deste
              dispositivo).
            </p>
            <button
              type="button"
              onClick={() => {
                setLoaded(null);
                setLabelId(null);
                setMovementId(null);
                setError('');
                setNow(new Date());
                setAttempt((value) => value + 1);
              }}
            >
              Atualizar recebimentos
            </button>
            {(() => {
              const counts = { overdue: 0, today: 0, tomorrow: 0, upcoming: 0 };
              for (const row of loaded.rows)
                counts[getExpiryStatus(row.expiry_date, timezone, now)]++;
              return (
                <p>
                  Vencidos: {counts.overdue} · Vence hoje: {counts.today} ·{' '}
                  Vence amanhã: {counts.tomorrow} · Posteriores:{' '}
                  {counts.upcoming}
                </p>
              );
            })()}
            <label>
              Buscar por produto, lote ou ID do recipiente{' '}
              <input
                type="search"
                aria-label="Buscar por produto, lote ou ID do recipiente"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </section>
          {loaded.rows.length === 0 ? (
            <p>Nenhum recebimento registrado.</p>
          ) : (
            (() => {
              const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
              const products = new Map(
                loaded.products.map((product) => [product.id, product.name]),
              );
              const visibleRows = loaded.rows.filter((row) => {
                const productName =
                  row.product_name ?? products.get(row.product_id) ?? 'Produto';
                return [productName, row.source_code, row.container_id ?? '']
                  .join(' ')
                  .toLocaleLowerCase('pt-BR')
                  .includes(normalizedSearch);
              });
              return visibleRows.length ? (
                <ul aria-label="Recebimentos e validade">
                  {visibleRows.map((row) => {
                    const status = getExpiryStatus(
                      row.expiry_date,
                      timezone,
                      now,
                    );
                    const statusLabel = {
                      overdue: 'Vencido',
                      today: 'Vence hoje',
                      tomorrow: 'Vence amanhã',
                      upcoming: 'Posterior',
                    }[status];
                    return (
                      <li key={row.id}>
                        {row.product_name ??
                          products.get(row.product_id) ??
                          'Produto'}{' '}
                        — lote {row.source_code} — {row.quantity} {row.unit} —
                        validade {row.expiry_date} (
                        {row.expiry_origin === 'original'
                          ? 'original'
                          : 'definida pelo responsável'}
                        ) — {statusLabel}
                        {row.container_id && (
                          <> — recipiente {row.container_id}</>
                        )}
                        {movements && (
                          <button
                            type="button"
                            onClick={() => setMovementId(row.id)}
                          >
                            Ver movimentações
                          </button>
                        )}
                        {movements && movementId === row.id && (
                          <MovementPanel
                            key={row.id}
                            scope={{ organizationId, establishmentId }}
                            userId={userId}
                            batch={{
                              id: row.id,
                              productName:
                                row.product_name ??
                                products.get(row.product_id) ??
                                'Produto',
                              sourceCode: row.source_code,
                              quantity: row.quantity,
                              unit: row.unit,
                            }}
                            canCreate={canCreate}
                            gateway={movements}
                          />
                        )}
                        {canCreate && labels && (
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
                                    row.id,
                                  )
                                  .then(
                                    (id) => {
                                      setLabelId(id);
                                      setLoaded(null);
                                      setAttempt((value) => value + 1);
                                    },
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
              ) : (
                <p>Nenhum recebimento corresponde à busca.</p>
              );
            })()
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
                      {loaded.products.map((p) => (
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
                      {loaded.suppliers.map((p) => (
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
