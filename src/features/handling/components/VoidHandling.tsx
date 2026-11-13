import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { HandlingGateway } from '../application/handlingGateway';
import { HandlingRejected } from '../application/handlingGateway';
import { voidInputSchema } from '../domain/handling';

// Anulação da manipulação inteira (D-032, D-040): motivo obrigatório, sem anulação parcial. O banco
// decide se ainda pode anular (nenhum derivado com movimento); a tela só mostra a recusa dele.
export function VoidHandling({
  scope,
  handlingId,
  gateway,
  onVoided,
}: {
  scope: CatalogScope;
  handlingId: string;
  gateway: HandlingGateway;
  onVoided: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const intent = useRef(crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const input = voidInputSchema.safeParse({
      handlingId,
      reason,
      intentId: intent.current,
    });
    if (!input.success) {
      setError('Escreva o motivo da anulação (até 500 caracteres).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await gateway.void(scope, input.data);
      onVoided();
    } catch (cause) {
      if (cause instanceof HandlingRejected) {
        setError(cause.message);
        if (cause.conflict) setConflict(true);
        else intent.current = crypto.randomUUID();
      } else {
        setError(
          'Não foi possível confirmar a anulação. Repita a mesma tentativa.',
        );
      }
      setBusy(false);
    }
  }
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Anular manipulação
      </button>
    );
  return (
    <form aria-label="Anular manipulação" onSubmit={(e) => void submit(e)}>
      <fieldset disabled={busy}>
        <legend>Anular manipulação</legend>
        <p>
          A anulação devolve a quantidade à origem e zera os recipientes
          derivados, sem apagar o histórico. Ela não recupera o alimento
          fisicamente e não pode ser parcial. Só é possível enquanto nenhum
          derivado tiver movimento.
        </p>
        <label>
          Motivo da anulação{' '}
          <textarea
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>{' '}
        <button type="submit">Confirmar anulação</button>{' '}
        <button type="button" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        {error && <p role="alert">{error}</p>}
        {conflict && (
          <button
            type="button"
            onClick={() => {
              intent.current = crypto.randomUUID();
              setConflict(false);
              setError('');
            }}
          >
            Já conferi; iniciar nova tentativa
          </button>
        )}
      </fieldset>
    </form>
  );
}
