import { useRef, useState } from 'react';
import { IconAction } from '../../../shared/ui/IconAction';
import type { FormEvent } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { ProductionGateway } from '../application/productionGateway';
import { ProductionRejected } from '../application/productionGateway';
import { productionVoidInputSchema } from '../domain/production';
import { markUnitDraftClean } from '../../identity/application/unitDrafts';

export const VOID_PRODUCTION_TEXT =
  'A anulação zera o saldo do lote e é definitiva: não se desfaz. Só é possível antes de qualquer consumo, descarte, porcionamento ou mudança de local, mesmo que tenham sido desfeitos depois. Depois disso, use o descarte com motivo. Se a anulação for por engano, registre a produção de novo.';

// Fatia 7.3 (D-051): anular a produção inteira, com motivo. O banco decide se ainda pode; a tela só
// repete a recusa dele.
export function VoidProduction({
  scope,
  batchId,
  label,
  gateway,
  onVoided,
  icon = false,
}: {
  scope: CatalogScope;
  batchId: string;
  label: string;
  gateway: ProductionGateway;
  onVoided: () => void;
  /** Mostra só o ícone, em contorno vermelho (nome acessível e dica: "Anular produção <código>"). */
  icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const intent = useRef(crypto.randomUUID());
  const form = useRef<HTMLFormElement | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const input = productionVoidInputSchema.safeParse({
      batchId,
      reason,
      intentId: intent.current,
    });
    if (!input.success) {
      setError('Escreva o motivo da anulação (até 300 caracteres).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await gateway.void(scope, input.data);
      markUnitDraftClean(form.current);
      setOpen(false);
      onVoided();
    } catch (cause) {
      if (cause instanceof ProductionRejected) {
        setError(cause.message);
        if (cause.conflict) setConflict(true);
        else intent.current = crypto.randomUUID();
      } else {
        setError(
          'Não foi possível confirmar a anulação. Repita a mesma tentativa; a lista mostra se ela foi gravada.',
        );
      }
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return icon ? (
      <IconAction
        icon="anular"
        risk
        label={`Anular produção ${label}`}
        onClick={() => setOpen(true)}
      />
    ) : (
      <button className="risk" type="button" onClick={() => setOpen(true)}>
        Anular produção
      </button>
    );
  return (
    <form
      ref={form}
      data-unit-draft-key={`void-production-${batchId}`}
      aria-label={`Anular produção ${label}`}
      onSubmit={(event) => void submit(event)}
    >
      <fieldset disabled={busy}>
        <legend>Anular produção {label}</legend>
        <p>{VOID_PRODUCTION_TEXT}</p>
        <label>
          Motivo da anulação{' '}
          <textarea
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>{' '}
        <button className="risk-confirm" type="submit" disabled={conflict}>
          Confirmar anulação
        </button>{' '}
        <button
          className="secondary"
          type="button"
          data-draft-discard={`void-production-${batchId}`}
          onClick={() => setOpen(false)}
        >
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
