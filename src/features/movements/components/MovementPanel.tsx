import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { markUnitDraftClean } from '../../identity/application/unitDrafts';
import { z } from 'zod';
import type { CatalogScope } from '../../catalog/domain/catalog';
import { lotText } from '../../batches/domain/lot';
import type {
  Movement,
  MovementGateway,
  MovementInput,
} from '../application/movementGateway';
import {
  MovementBlocked,
  MovementOverBalance,
  MovementRejected,
} from '../application/movementGateway';
import { EXPIRED_NOTE, EXPIRED_TEXT } from '../../batches/domain/expiryStatus';
import { BLOCK_TEXT } from '../../occurrences/domain/occurrence';
import type { BlockStatus } from '../../occurrences/domain/occurrence';
import { formatDateTime } from '../../../shared/format/dates';
import { MoreInfo } from '../../../shared/ui/MoreInfo';
import {
  QUANTITY_HINT,
  formatQuantity,
  quantityProblemText,
  toDotQuantity,
} from '../../../shared/format/quantity';

// V3 (M4): quem registrou aparece pelo nome de exibição da organização. Sem nome (pessoa sem nome
// de exibição ou sem acesso atual), mostra um texto neutro; os identificadores ficam recolhidos.
type MemberName = { user_id: string; display_name: string | null };
function authorName(names: Map<string, string> | null, id: string): string {
  if (!names) return 'pessoa da organização';
  return names.get(id) ?? 'pessoa sem nome de exibição';
}

const savedSchema = z
  .object({
    batchId: z.string(),
    containerId: z.uuid().optional(),
    kind: z.enum(['consumption', 'discard', 'reversal']),
    quantity: z.string(),
    reason: z.string().nullable(),
    intentId: z.uuid(),
    targetId: z.uuid().optional(),
  })
  .refine((value) => value.kind !== 'reversal' || value.targetId !== undefined);
export function MovementPanel({
  scope,
  userId,
  batch,
  canCreate,
  gateway,
  onRecorded,
  blocked,
  expired,
  loadMembers,
  containerId,
}: {
  scope: CatalogScope;
  userId: string;
  batch: {
    id: string;
    productName: string;
    sourceCode: string | null;
    quantity: number;
    unit: string;
  };
  canCreate: boolean;
  gateway: MovementGateway;
  // Fatia 6.2: avisa o painel para reler o saldo do recipiente depois de um registro confirmado.
  onRecorded?: () => void;
  // Fatia 6.5b: recipiente bloqueado por ocorrência. Só o descarte passa (D-029); o banco recusa o resto.
  blocked?: BlockStatus;
  // Fatia 6.11: validade do recipiente já passou na data da unidade. O banco recusa o consumo; o
  // formulário só oferece o descarte.
  expired?: boolean;
  // V3: nomes de exibição; sem a função, o histórico não mostra nomes.
  loadMembers?: (scope: CatalogScope) => Promise<MemberName[]>;
  // D-073 (etapa 2): recipiente que não é o integral (porção ou derivado). Sem ele, o painel opera
  // no integral do recebimento, como antes; com ele, histórico, saldo e saídas são desse recipiente.
  containerId?: string;
}) {
  const [names, setNames] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!loadMembers) return;
    let current = true;
    void loadMembers({
      organizationId: scope.organizationId,
      establishmentId: scope.establishmentId,
    }).then(
      (rows) => {
        if (current)
          setNames(
            new Map(
              rows
                .filter((row) => row.display_name)
                .map((row) => [row.user_id, row.display_name!]),
            ),
          );
      },
      // Nomes são informação extra: o histórico continua sem eles.
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [loadMembers, scope.organizationId, scope.establishmentId]);
  const key = `movement-intent:${userId}:${scope.organizationId}:${scope.establishmentId}:${batch.id}${containerId ? `:${containerId}` : ''}`;
  const listEvents = (target: CatalogScope) =>
    containerId
      ? gateway.list(target, batch.id, containerId)
      : gateway.list(target, batch.id);
  const [events, setEvents] = useState<Movement[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [stored] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      const value = raw ? savedSchema.parse(JSON.parse(raw)) : null;
      if (
        value &&
        (value.batchId !== batch.id || value.containerId !== containerId)
      )
        throw new Error();
      return { value, invalid: false };
    } catch {
      return { value: null, invalid: true };
    }
  });
  const [pending, setPending] = useState<MovementInput | null>(stored.value);
  const [reviewing, setReviewing] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [reviewedHistory, setReviewedHistory] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reversing, setReversing] = useState<Movement | null>(null);
  // D-073 (etapa 2): depois de uma saída confirmada, mostra o saldo relido do servidor.
  const [afterExit, setAfterExit] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    const target = {
      organizationId: scope.organizationId,
      establishmentId: scope.establishmentId,
    };
    void (
      containerId
        ? gateway.list(target, batch.id, containerId)
        : gateway.list(target, batch.id)
    ).then(
      (rows) => {
        if (current) setEvents(rows);
      },
      (cause: unknown) => {
        if (current) {
          setEvents(null);
          setError(
            cause instanceof Error &&
              cause.message.startsWith('O histórico excede')
              ? cause.message
              : 'Não foi possível consultar o histórico.',
          );
        }
      },
    );
    return () => {
      current = false;
    };
  }, [
    gateway,
    scope.organizationId,
    scope.establishmentId,
    batch.id,
    containerId,
    version,
  ]);
  async function send(input: MovementInput) {
    setBusy(true);
    setError('');
    setNotice('');
    setAfterExit(false);
    try {
      await gateway.record(scope, input);
    } catch (cause) {
      if (!active.current) return;
      setRejected(cause instanceof MovementRejected);
      setReviewedHistory(false);
      setError(
        cause instanceof MovementBlocked
          ? `${cause.message} Atualize o histórico antes de iniciar outra tentativa.`
          : cause instanceof MovementOverBalance
            ? 'Saída recusada: a quantidade é maior que o saldo registrado deste recipiente. Nada foi gravado. Atualize o histórico e confira o saldo antes de iniciar outra tentativa.'
            : cause instanceof MovementRejected
              ? `${input.kind === 'reversal' ? 'Anulação' : 'Saída'} recusada. Atualize o histórico e confira o saldo antes de iniciar outra tentativa.`
              : 'Não foi possível confirmar a saída. Repita a mesma tentativa; não crie outra sem conferir o histórico.',
      );
      setBusy(false);
      return;
    }
    if (!active.current) return;
    onRecorded?.();
    try {
      const current = savedSchema.parse(
        JSON.parse(sessionStorage.getItem(key) ?? 'null'),
      );
      if (current.intentId !== input.intentId)
        throw new Error('Tentativa alterada.');
      sessionStorage.removeItem(key);
      setPending(null);
      if (input.kind === 'reversal')
        setNotice(
          'Anulação registrada. Para substituir, registre uma nova saída.',
        );
      else setAfterExit(true);
      setEvents(null);
      setVersion((v) => v + 1);
    } catch {
      setConfirmed(true);
      setError(
        `${input.kind === 'reversal' ? 'Anulação' : 'Saída'} confirmada, mas não foi possível limpar a tentativa nesta aba.`,
      );
    } finally {
      setBusy(false);
    }
  }
  function clearPending() {
    try {
      const current = savedSchema.parse(
        JSON.parse(sessionStorage.getItem(key) ?? 'null'),
      );
      if (!pending || current.intentId !== pending.intentId)
        throw new Error('Tentativa alterada.');
      sessionStorage.removeItem(key);
      setPending(null);
      setReviewing(false);
      setRejected(false);
      setConfirmed(false);
      setReviewedHistory(false);
      setError('');
      setEvents(null);
      setVersion((v) => v + 1);
    } catch {
      setError('Não foi possível limpar a tentativa nesta aba.');
    }
  }
  async function refreshHistory() {
    setBusy(true);
    try {
      const rows = await listEvents(scope);
      setEvents(rows);
      setReviewedHistory(true);
      setError('');
    } catch (cause) {
      setEvents(null);
      setError(
        cause instanceof Error && cause.message.startsWith('O histórico excede')
          ? cause.message
          : 'Não foi possível consultar o histórico.',
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = new FormData(e.currentTarget);
    const typed = String(fields.get('quantity') ?? '');
    const kind = String(fields.get('kind'));
    const reason = String(fields.get('reason') ?? '').trim();
    // V5 (D-063): vírgula ou ponto decimal; a validação de antes vale sobre a forma com ponto.
    const quantity = toDotQuantity(typed) ?? '';
    if (
      !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(quantity) ||
      Number(quantity) <= 0 ||
      Number(quantity) > 1000000000 ||
      (batch.unit === 'un' && !Number.isInteger(Number(quantity))) ||
      (kind !== 'consumption' && kind !== 'discard') ||
      (kind === 'discard' && !reason) ||
      reason.length > 500
    ) {
      setError(
        quantityProblemText(typed) ?? 'Confira tipo, quantidade e motivo.',
      );
      return;
    }
    setAfterExit(false);
    const input: MovementInput = {
      batchId: batch.id,
      ...(containerId ? { containerId } : {}),
      kind,
      quantity,
      reason: reason || null,
      intentId: crypto.randomUUID(),
    };
    try {
      sessionStorage.setItem(key, JSON.stringify(input));
      markUnitDraftClean(e.currentTarget);
      setPending(input);
      setReviewing(true);
    } catch {
      setError('Não foi possível guardar a tentativa nesta aba.');
    }
  }
  function reviewReversal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reversing) return;
    const reason = String(
      new FormData(e.currentTarget).get('reason') ?? '',
    ).trim();
    if (!reason || reason.length > 500) {
      setError('Informe o motivo da anulação.');
      return;
    }
    const input: MovementInput = {
      batchId: batch.id,
      ...(containerId ? { containerId } : {}),
      kind: 'reversal',
      quantity: String(reversing.quantity),
      reason,
      intentId: crypto.randomUUID(),
      targetId: reversing.id,
    };
    try {
      sessionStorage.setItem(key, JSON.stringify(input));
      markUnitDraftClean(e.currentTarget);
      setPending(input);
      setReviewing(true);
      setReversing(null);
      setError('');
    } catch {
      setError('Não foi possível guardar a tentativa nesta aba.');
    }
  }
  const total = events?.reduce(
    (sum, item) =>
      sum +
      (item.kind === 'reversal' || item.kind === 'transfer_reversal' ? -1 : 1) *
        Math.round(item.quantity * 1000),
    0,
  );
  const remaining =
    total === undefined
      ? null
      : (Math.round(batch.quantity * 1000) - total) / 1000;
  const original =
    pending?.kind === 'reversal'
      ? events?.find(
          (item) => item.id === pending.targetId && item.kind !== 'reversal',
        )
      : undefined;
  return (
    <section aria-label="Movimentações">
      <h3>Movimentações</h3>
      <p>
        {batch.productName} — {lotText(batch.sourceCode)} — quantidade inicial{' '}
        {formatQuantity(batch.quantity)} {batch.unit}
      </p>
      <p>O saldo registrado não comprova a quantidade física.</p>
      {blocked && (
        <p>
          <strong>{BLOCK_TEXT[blocked]}</strong>:{' '}
          {blocked === 'pending'
            ? 'consumo e manipulação ficam recusados até a decisão do proprietário. O descarte continua permitido.'
            : 'o proprietário rejeitou o uso. Só o descarte é permitido.'}
        </p>
      )}
      {expired && (
        <p className="expired-band">
          <strong>{EXPIRED_TEXT}</strong>: {EXPIRED_NOTE}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {afterExit && events && remaining !== null && (
        <p role="status">
          Saída registrada. Saldo agora: {formatQuantity(remaining)}{' '}
          {batch.unit}.
          {remaining <= 0 &&
            ' Recipiente esgotado: ele sai das validades ativas e continua em "Mostrar esgotados" e no histórico.'}
        </p>
      )}
      {/* V4 (M11): orientação geral recolhida. Saldo após a operação, avisos de anulação, bloqueio e
          vencido continuam sempre visíveis. */}
      <MoreInfo>
        <p>
          Confira a operação antes de confirmar. Se fechar a aba após uma falha,
          confira o histórico antes de registrar novamente.
        </p>
      </MoreInfo>
      {error && <p role="alert">{error}</p>}
      {!events && !error && <p>Consultando histórico…</p>}
      {stored.invalid && (
        <p role="alert">
          Não foi possível recuperar a tentativa anterior. Confira o histórico
          antes de prosseguir.
        </p>
      )}
      {!events && error && !rejected && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void refreshHistory()}
        >
          Tentar consultar histórico novamente
        </button>
      )}
      {events && remaining !== null && (
        <>
          <p>
            Saldo registrado: {formatQuantity(remaining)} {batch.unit}
          </p>
          <ul>
            {events.map((item) => (
              <li key={item.id}>
                {item.kind === 'reversal'
                  ? item.handlingId
                    ? 'Anulação do descarte de sobra (manipulação anulada)'
                    : 'Anulação do registro'
                  : item.kind === 'transfer_reversal'
                    ? 'Devolução da transferência (manipulação anulada)'
                    : item.kind === 'production_void'
                      ? 'Produção anulada'
                      : item.kind === 'handling_void'
                        ? 'Saída por anulação da manipulação'
                        : item.kind === 'transfer'
                          ? 'Transferência para recipientes derivados'
                          : item.kind === 'discard'
                            ? item.handlingId
                              ? 'Descarte de sobra da manipulação'
                              : 'Descarte'
                            : 'Consumo'}{' '}
                — {formatQuantity(item.quantity)} {batch.unit} —{' '}
                {item.reason ?? 'sem motivo'} —{' '}
                {formatDateTime(item.created_at, item.timezone)} — por{' '}
                {authorName(names, item.created_by)}
                {item.kind !== 'reversal' &&
                  events.some((event) => event.reverses_id === item.id) && (
                    <> — anulado</>
                  )}
                <details className="support-ids">
                  <summary>Identificadores (suporte)</summary>
                  <p>
                    Registro {item.id} — autor {item.created_by} — fuso{' '}
                    {item.timezone} — instante {item.created_at}
                    {item.kind === 'reversal' && (
                      <> — movimento original {item.reverses_id}</>
                    )}
                  </p>
                </details>
                {canCreate &&
                  !stored.invalid &&
                  !pending &&
                  item.kind !== 'reversal' &&
                  item.kind !== 'transfer' &&
                  item.kind !== 'transfer_reversal' &&
                  item.kind !== 'handling_void' &&
                  item.kind !== 'production_void' &&
                  !item.handlingId &&
                  !events.some((event) => event.reverses_id === item.id) && (
                    <button
                      className="risk"
                      disabled={busy}
                      type="button"
                      onClick={() => setReversing(item)}
                    >
                      Anular registro
                    </button>
                  )}
              </li>
            ))}
          </ul>
        </>
      )}
      {pending ? (
        <>
          <p>
            Tentativa pendente:{' '}
            {pending.kind === 'reversal'
              ? 'anulação do registro'
              : pending.kind === 'discard'
                ? 'descarte'
                : 'consumo'}{' '}
            de {formatQuantity(pending.quantity)} {batch.unit}.
          </p>
          {pending.reason && <p>Motivo: {pending.reason}</p>}
          {pending.kind === 'reversal' &&
            events &&
            (original ? (
              <p>
                Registro original:{' '}
                {original.kind === 'discard' ? 'Descarte' : 'Consumo'} —{' '}
                {formatDateTime(original.created_at, original.timezone)} —
                motivo {original.reason ?? 'sem motivo'} — por{' '}
                {authorName(names, original.created_by)} — ID {original.id}
              </p>
            ) : (
              <p>
                Não foi possível localizar o registro original no histórico;
                atualize o histórico antes de continuar.
              </p>
            ))}
          {pending.kind === 'reversal' && events && !original && !rejected && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void refreshHistory()}
            >
              Atualizar histórico
            </button>
          )}
          {pending.kind === 'reversal' && (
            <p>
              A anulação corrige somente o registro; não recupera alimento nem
              desfaz descarte físico. Para substituir, registre uma nova saída.
            </p>
          )}
          {reviewing && remaining !== null && (
            <p>
              Saldo após a operação, se confirmada:{' '}
              {formatQuantity(
                (Math.round(remaining * 1000) -
                  (pending.kind === 'reversal' ? -1 : 1) *
                    Math.round(Number(pending.quantity) * 1000)) /
                  1000,
              )}{' '}
              {batch.unit}. O servidor confirmará o saldo atual.
            </p>
          )}
          {canCreate && !confirmed && !rejected && (
            <button
              // V4 (M1): anular registro e descartar alimento são de risco (vermelho cheio).
              className={
                pending.kind === 'consumption' ? undefined : 'risk-confirm'
              }
              disabled={
                busy || !events || (pending.kind === 'reversal' && !original)
              }
              onClick={() => {
                setReviewing(false);
                void send(pending);
              }}
            >
              {reviewing
                ? pending.kind === 'reversal'
                  ? 'Confirmar anulação'
                  : 'Confirmar saída'
                : 'Repetir tentativa'}
            </button>
          )}
          {reviewing && (
            <button
              className="secondary"
              disabled={busy}
              onClick={clearPending}
            >
              Corrigir antes de enviar
            </button>
          )}
          {rejected && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void refreshHistory()}
              >
                Atualizar histórico
              </button>
              {reviewedHistory && (
                <button disabled={busy} onClick={clearPending}>
                  Iniciar outra tentativa
                </button>
              )}
            </>
          )}
          {confirmed && (
            <button
              className="secondary"
              disabled={busy}
              onClick={clearPending}
            >
              Limpar tentativa confirmada
            </button>
          )}
        </>
      ) : reversing && canCreate ? (
        <form
          data-unit-draft-key={`movement-reversal-${batch.id}`}
          onSubmit={reviewReversal}
        >
          <p>
            Anular {reversing.kind === 'discard' ? 'descarte' : 'consumo'} de{' '}
            {formatQuantity(reversing.quantity)} {batch.unit}.
          </p>
          <label>
            Motivo da anulação <input name="reason" required maxLength={500} />
          </label>
          <button className="risk">Revisar anulação</button>
          <button
            className="secondary"
            type="button"
            onClick={() => setReversing(null)}
          >
            Voltar
          </button>
        </form>
      ) : (
        canCreate &&
        events &&
        !stored.invalid && (
          <form
            data-unit-draft-key={`movement-${containerId ?? batch.id}`}
            onSubmit={submit}
          >
            <label>
              Tipo de saída{' '}
              <select name="kind">
                {!expired && <option value="consumption">Consumo</option>}
                <option value="discard">Descarte</option>
              </select>
            </label>
            <label>
              Quantidade da saída{' '}
              <input name="quantity" required inputMode="decimal" />
            </label>
            <label>
              Motivo (obrigatório para descarte){' '}
              <input aria-label="Motivo" name="reason" maxLength={500} />
            </label>
            <p>{QUANTITY_HINT}</p>
            <button disabled={busy}>Registrar saída</button>
          </form>
        )
      )}
    </section>
  );
}
