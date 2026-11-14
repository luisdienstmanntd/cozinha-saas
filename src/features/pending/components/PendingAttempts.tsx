import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { OperationGateway } from '../application/operationGateway';
import { kindLabels, pendingStore } from '../domain/pending';
import type { PendingAttempt } from '../domain/pending';

type Check =
  | { state: 'checking' }
  | { state: 'confirmed'; createdAt: string }
  | { state: 'missing' }
  | { state: 'error' };

function when(ms: number, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
}

// Faixa de tentativas pendentes (desenho 4.7 e 7.5). Para cada registro que não foi confirmado, pergunta
// ao servidor; se ele já tem a operação, mostra "Registro confirmado"; se não, oferece "Enviar
// novamente" (mesmo identificador) ou "Descartar tentativa". Nunca reenvia sozinha.
export function PendingAttempts({
  scope,
  userId,
  timezone,
  operations,
  resend,
  onResolved,
}: {
  scope: CatalogScope;
  userId: string;
  timezone: string;
  operations: OperationGateway;
  resend: (attempt: PendingAttempt) => Promise<unknown>;
  onResolved?: () => void;
}) {
  const [list, setList] = useState<PendingAttempt[]>([]);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const asked = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(() => {
    setList(
      pendingStore
        .list(userId)
        .filter(
          (item) =>
            item.organizationId === scope.organizationId &&
            item.establishmentId === scope.establishmentId,
        ),
    );
  }, [userId, scope.organizationId, scope.establishmentId]);
  useEffect(() => {
    reload();
    return pendingStore.subscribe(reload);
  }, [reload]);

  const check = useCallback(
    async (item: PendingAttempt) => {
      setChecks((previous) => ({
        ...previous,
        [item.intentId]: { state: 'checking' },
      }));
      try {
        const found = await operations.find(scope, item.intentId);
        if (!mounted.current) return;
        setChecks((previous) => ({
          ...previous,
          [item.intentId]: found
            ? { state: 'confirmed', createdAt: found.createdAt }
            : { state: 'missing' },
        }));
      } catch {
        if (mounted.current)
          setChecks((previous) => ({
            ...previous,
            [item.intentId]: { state: 'error' },
          }));
      }
    },
    [operations, scope],
  );
  useEffect(() => {
    for (const item of list)
      if (!asked.current.has(item.intentId)) {
        asked.current.add(item.intentId);
        void check(item);
      }
  }, [list, check]);

  async function send(item: PendingAttempt) {
    setBusy(item.intentId);
    setErrors((previous) => ({ ...previous, [item.intentId]: '' }));
    setNotice('');
    try {
      await resend(item);
      pendingStore.remove(userId, item.intentId);
      if (mounted.current) setNotice('Registro enviado e confirmado.');
      onResolved?.();
    } catch (cause) {
      if (!mounted.current) return;
      setErrors((previous) => ({
        ...previous,
        [item.intentId]:
          cause instanceof Error
            ? cause.message
            : 'Não foi possível enviar. Confira de novo antes de tentar outra vez.',
      }));
      // O servidor pode ter gravado mesmo assim: confere de novo antes de qualquer outra tentativa.
      void check(item);
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  if (list.length === 0) return notice ? <p role="status">{notice}</p> : null;
  return (
    <section aria-label="Registros não confirmados">
      <h3>
        Há {list.length}{' '}
        {list.length === 1
          ? 'registro não confirmado'
          : 'registros não confirmados'}
      </h3>
      {notice && <p role="status">{notice}</p>}
      <ul>
        {list.map((item) => {
          const state = checks[item.intentId] ?? { state: 'checking' };
          return (
            <li key={item.intentId}>
              {kindLabels[item.kind]} — {item.summary} — de{' '}
              {when(item.createdAt, timezone)}.{' '}
              {state.state === 'checking' && 'Conferindo no servidor…'}
              {state.state === 'confirmed' && (
                <>
                  <strong>Registro confirmado</strong>: o servidor já tem esta
                  operação. Nada será enviado de novo.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      pendingStore.remove(userId, item.intentId);
                      onResolved?.();
                    }}
                  >
                    Entendi
                  </button>
                </>
              )}
              {state.state === 'missing' && (
                <>
                  O servidor não tem este registro.{' '}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void send(item)}
                  >
                    Enviar novamente
                  </button>{' '}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => pendingStore.remove(userId, item.intentId)}
                  >
                    Descartar tentativa
                  </button>
                </>
              )}
              {state.state === 'error' && (
                <>
                  Não foi possível conferir no servidor.{' '}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void check(item)}
                  >
                    Conferir de novo
                  </button>
                </>
              )}
              {errors[item.intentId] && (
                <span role="alert"> {errors[item.intentId]}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
