import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { z } from 'zod';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type {
  Movement,
  MovementGateway,
  MovementInput,
} from '../application/movementGateway';
import { MovementRejected } from '../application/movementGateway';

const savedSchema = z
  .object({
    batchId: z.string(),
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
}: {
  scope: CatalogScope;
  userId: string;
  batch: {
    id: string;
    productName: string;
    sourceCode: string;
    quantity: number;
    unit: string;
  };
  canCreate: boolean;
  gateway: MovementGateway;
  // Fatia 6.2: avisa o painel para reler o saldo do recipiente depois de um registro confirmado.
  onRecorded?: () => void;
}) {
  const key = `movement-intent:${userId}:${scope.organizationId}:${scope.establishmentId}:${batch.id}`;
  const [events, setEvents] = useState<Movement[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [stored] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      const value = raw ? savedSchema.parse(JSON.parse(raw)) : null;
      if (value && value.batchId !== batch.id) throw new Error();
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
    void gateway
      .list(
        {
          organizationId: scope.organizationId,
          establishmentId: scope.establishmentId,
        },
        batch.id,
      )
      .then(
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
  }, [gateway, scope.organizationId, scope.establishmentId, batch.id, version]);
  async function send(input: MovementInput) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await gateway.record(scope, input);
    } catch (cause) {
      if (!active.current) return;
      setRejected(cause instanceof MovementRejected);
      setReviewedHistory(false);
      setError(
        cause instanceof MovementRejected
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
      const rows = await gateway.list(scope, batch.id);
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
    const quantity = String(fields.get('quantity') ?? '');
    const kind = String(fields.get('kind'));
    const reason = String(fields.get('reason') ?? '').trim();
    if (
      !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(quantity) ||
      Number(quantity) <= 0 ||
      Number(quantity) > 1000000000 ||
      (batch.unit === 'un' && !Number.isInteger(Number(quantity))) ||
      (kind !== 'consumption' && kind !== 'discard') ||
      (kind === 'discard' && !reason) ||
      reason.length > 500
    ) {
      setError('Confira tipo, quantidade e motivo.');
      return;
    }
    const input: MovementInput = {
      batchId: batch.id,
      kind,
      quantity,
      reason: reason || null,
      intentId: crypto.randomUUID(),
    };
    try {
      sessionStorage.setItem(key, JSON.stringify(input));
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
      kind: 'reversal',
      quantity: String(reversing.quantity),
      reason,
      intentId: crypto.randomUUID(),
      targetId: reversing.id,
    };
    try {
      sessionStorage.setItem(key, JSON.stringify(input));
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
        {batch.productName} — lote {batch.sourceCode} — quantidade inicial{' '}
        {batch.quantity} {batch.unit}
      </p>
      <p>O saldo registrado não comprova a quantidade física.</p>
      {notice && <p role="status">{notice}</p>}
      <p>
        Confira a operação antes de confirmar. Se fechar a aba após uma falha,
        confira o histórico antes de registrar novamente.
      </p>
      {error && <p role="alert">{error}</p>}
      {!events && !error && <p>Consultando histórico…</p>}
      {stored.invalid && (
        <p role="alert">
          Não foi possível recuperar a tentativa anterior. Confira o histórico
          antes de prosseguir.
        </p>
      )}
      {!events && error && !rejected && (
        <button disabled={busy} onClick={() => void refreshHistory()}>
          Tentar consultar histórico novamente
        </button>
      )}
      {events && remaining !== null && (
        <>
          <p>
            Saldo registrado: {remaining} {batch.unit}
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
                    : item.kind === 'handling_void'
                      ? 'Saída por anulação da manipulação'
                      : item.kind === 'transfer'
                        ? 'Transferência para recipientes derivados'
                        : item.kind === 'discard'
                          ? item.handlingId
                            ? 'Descarte de sobra da manipulação'
                            : 'Descarte'
                          : 'Consumo'}{' '}
                — {item.quantity} {batch.unit} — {item.reason ?? 'sem motivo'} —{' '}
                {item.created_at} — fuso {item.timezone} — autor{' '}
                {item.created_by} — ID {item.id}
                {item.kind === 'reversal' && (
                  <> — movimento original {item.reverses_id}</>
                )}
                {item.kind !== 'reversal' &&
                  events.some((event) => event.reverses_id === item.id) && (
                    <> — anulado</>
                  )}
                {canCreate &&
                  !stored.invalid &&
                  !pending &&
                  item.kind !== 'reversal' &&
                  item.kind !== 'transfer' &&
                  item.kind !== 'transfer_reversal' &&
                  item.kind !== 'handling_void' &&
                  !item.handlingId &&
                  !events.some((event) => event.reverses_id === item.id) && (
                    <button
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
            de {pending.quantity} {batch.unit}.
          </p>
          {pending.reason && <p>Motivo: {pending.reason}</p>}
          {pending.kind === 'reversal' &&
            events &&
            (original ? (
              <p>
                Registro original:{' '}
                {original.kind === 'discard' ? 'Descarte' : 'Consumo'} —{' '}
                {original.created_at} — motivo {original.reason ?? 'sem motivo'}{' '}
                — ID {original.id}
              </p>
            ) : (
              <p>
                Não foi possível localizar o registro original no histórico;
                atualize o histórico antes de continuar.
              </p>
            ))}
          {pending.kind === 'reversal' && events && !original && !rejected && (
            <button disabled={busy} onClick={() => void refreshHistory()}>
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
              {(Math.round(remaining * 1000) -
                (pending.kind === 'reversal' ? -1 : 1) *
                  Math.round(Number(pending.quantity) * 1000)) /
                1000}{' '}
              {batch.unit}. O servidor confirmará o saldo atual.
            </p>
          )}
          {canCreate && !confirmed && !rejected && (
            <button
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
            <button disabled={busy} onClick={clearPending}>
              Corrigir antes de enviar
            </button>
          )}
          {rejected && (
            <>
              <button disabled={busy} onClick={() => void refreshHistory()}>
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
            <button disabled={busy} onClick={clearPending}>
              Limpar tentativa confirmada
            </button>
          )}
        </>
      ) : reversing && canCreate ? (
        <form onSubmit={reviewReversal}>
          <p>
            Anular {reversing.kind === 'discard' ? 'descarte' : 'consumo'} de{' '}
            {reversing.quantity} {batch.unit}.
          </p>
          <label>
            Motivo da anulação <input name="reason" required maxLength={500} />
          </label>
          <button>Revisar anulação</button>
          <button type="button" onClick={() => setReversing(null)}>
            Voltar
          </button>
        </form>
      ) : (
        canCreate &&
        events &&
        !stored.invalid && (
          <form onSubmit={submit}>
            <label>
              Tipo de saída{' '}
              <select name="kind">
                <option value="consumption">Consumo</option>
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
            <p>Use ponto para decimais, por exemplo 0.5.</p>
            <button disabled={busy}>Registrar saída</button>
          </form>
        )
      )}
    </section>
  );
}
