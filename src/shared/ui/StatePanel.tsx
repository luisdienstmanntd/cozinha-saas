import type { ReactNode } from 'react';

type Props =
  | { kind: 'loading'; message: string }
  | { kind: 'empty'; message: string; action?: ReactNode }
  | { kind: 'zero'; message: string }
  | { kind: 'error'; message: string; onRetry?: () => void };

/**
 * PR-03 (M1): quatro estados de lista/consulta com papéis distintos. Carregando é `role="status"`;
 * erro é `role="alert"` com "Tentar novamente"; vazio diz a próxima ação; zero é um zero real (a
 * consulta respondeu e não há nada), nunca um número de exemplo.
 */
export function StatePanel(props: Props) {
  if (props.kind === 'loading')
    return (
      <p role="status" className="ui-state ui-state-loading">
        {props.message}
      </p>
    );
  if (props.kind === 'error')
    return (
      <div role="alert" className="ui-state ui-state-error">
        <p>{props.message}</p>
        {props.onRetry ? (
          <button type="button" className="secondary" onClick={props.onRetry}>
            Tentar novamente
          </button>
        ) : null}
      </div>
    );
  return (
    <div className={`ui-state ui-state-${props.kind}`}>
      <p>{props.message}</p>
      {props.kind === 'empty' ? props.action : null}
    </div>
  );
}
