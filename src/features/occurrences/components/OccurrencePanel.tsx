import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { OccurrenceGateway } from '../application/occurrenceGateway';
import { DecisionRejected } from '../application/occurrenceGateway';
import type { Decision, OccurrenceRow } from '../domain/occurrence';
import {
  BLOCK_TEXT,
  decisionInputSchema,
  elapsedSince,
  formatAt,
  kindLabels,
  OCCURRENCE_LIMIT,
} from '../domain/occurrence';

// Desenho 7.3 e 7.6 (fatia 6.5b): bloqueados no topo do painel, com motivo e tempo desde a ocorrência.
// Só o proprietário registra a decisão (D-019); o membro vê o bloqueio. A decisão é de quem responde
// pela cozinha: a tela não sugere liberar nem rejeitar e não classifica a temperatura.
export const DECISION_GUIDANCE =
  'Decida seguindo o procedimento sanitário da cozinha. A decisão fica registrada com a justificativa e não pode ser trocada.';

function DecisionForm({
  row,
  scope,
  gateway,
  onDecided,
  onCancel,
}: {
  row: OccurrenceRow;
  scope: CatalogScope;
  gateway: OccurrenceGateway;
  onDecided: (decision: Decision) => void;
  onCancel: () => void;
}) {
  const [decision, setDecision] = useState<Decision | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Mesma tentativa enquanto o formulário estiver aberto: repetir após falha de rede não duplica.
  const intent = useRef<string>(crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const input = decisionInputSchema.safeParse({
      occurrenceId: row.occurrence_id,
      decision,
      reason,
      intentId: intent.current,
    });
    if (!input.success) {
      setError(
        'Escolha liberar ou rejeitar e escreva a justificativa (até 500 caracteres).',
      );
      return;
    }
    setBusy(true);
    setError('');
    try {
      await gateway.decide(scope, input.data);
      onDecided(input.data.decision);
    } catch (cause) {
      setError(
        cause instanceof DecisionRejected
          ? cause.message
          : 'Não foi possível confirmar a decisão. Repita a mesma tentativa.',
      );
      setBusy(false);
    }
  }
  return (
    <form
      aria-label={`Decisão da ocorrência de ${row.product_name}`}
      onSubmit={(event) => void submit(event)}
    >
      <fieldset disabled={busy}>
        <legend>Registrar decisão</legend>
        <p>{DECISION_GUIDANCE}</p>
        <label>
          <input
            type="radio"
            name="decision"
            value="released"
            checked={decision === 'released'}
            onChange={() => setDecision('released')}
          />{' '}
          Liberar o uso
        </label>{' '}
        <label>
          <input
            type="radio"
            name="decision"
            value="rejected"
            checked={decision === 'rejected'}
            onChange={() => setDecision('rejected')}
          />{' '}
          Rejeitar (o saldo só poderá ser descartado)
        </label>
        <p>
          <label>
            Justificativa da decisão{' '}
            <textarea
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </p>
        <button type="submit">Confirmar decisão</button>{' '}
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </form>
  );
}

export function OccurrencePanel({
  rows,
  decided,
  scope,
  gateway,
  canDecide,
  now,
  onDecided,
}: {
  rows: OccurrenceRow[];
  // Ocorrências já decididas, quando o usuário pede para ver (null = não carregadas).
  decided: OccurrenceRow[] | null;
  scope: CatalogScope;
  gateway: OccurrenceGateway;
  canDecide: boolean;
  now: Date;
  onDecided: (message: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = decided ?? rows;
  return (
    <section aria-label="Bloqueios e ocorrências">
      <h4>Bloqueios e ocorrências</h4>
      {shown.length === 0 ? (
        <p>
          {decided
            ? 'Nenhuma ocorrência registrada.'
            : 'Nenhum recipiente bloqueado.'}
        </p>
      ) : (
        <ul aria-label="Ocorrências">
          {shown.map((row) => (
            <li key={row.occurrence_id}>
              <strong>
                {row.status === 'released'
                  ? 'Liberado pelo proprietário'
                  : BLOCK_TEXT[row.status]}
              </strong>{' '}
              — {kindLabels[row.kind]} — {row.product_name} — lote{' '}
              {row.source_code}
              <br />
              Motivo registrado: {row.reason} — em{' '}
              {formatAt(row.created_at, row.timezone)} (
              {elapsedSince(row.created_at, now)})
              {row.status !== 'pending' && row.decided_at && (
                <>
                  <br />
                  {row.status === 'released' ? 'Liberado' : 'Rejeitado'} em{' '}
                  {formatAt(row.decided_at, row.timezone)}. Justificativa:{' '}
                  {row.decision_reason}
                </>
              )}
              {row.containers.length > 0 && (
                <>
                  <br />
                  {row.status === 'released'
                    ? 'Recipientes com saldo'
                    : 'Recipientes bloqueados'}
                  :{' '}
                  {row.containers
                    .map(
                      (container) =>
                        `${container.short_code} (saldo ${container.balance} ${row.unit})`,
                    )
                    .join(', ')}
                </>
              )}
              {row.status === 'rejected' && row.containers.length > 0 && (
                <>
                  <br />
                  Registre o descarte do saldo em &quot;Ver movimentações&quot;.
                </>
              )}
              {row.status === 'pending' &&
                (canDecide ? (
                  open === row.occurrence_id ? (
                    <DecisionForm
                      row={row}
                      scope={scope}
                      gateway={gateway}
                      onCancel={() => setOpen(null)}
                      onDecided={(decision) => {
                        setOpen(null);
                        onDecided(
                          decision === 'released'
                            ? `Decisão registrada: ${row.product_name} liberado.`
                            : `Decisão registrada: ${row.product_name} rejeitado. Só o descarte é permitido.`,
                        );
                      }}
                    />
                  ) : (
                    <>
                      {' '}
                      <button
                        type="button"
                        onClick={() => setOpen(row.occurrence_id)}
                      >
                        Registrar decisão
                      </button>
                    </>
                  )
                ) : (
                  <>
                    <br />
                    Somente o proprietário registra a decisão.
                  </>
                ))}
            </li>
          ))}
        </ul>
      )}
      {shown.length >= OCCURRENCE_LIMIT && (
        <p role="status">
          A lista mostra até {OCCURRENCE_LIMIT} ocorrências; outras podem não
          aparecer.
        </p>
      )}
    </section>
  );
}
