import type { ReactNode } from 'react';
import { ActionLink } from './ActionLink';

export type StatTone = 'neutral' | 'overdue' | 'today' | 'tomorrow';

/**
 * PR-03 (M1): contador com rótulo, número tabular, dica e tom. Com `link`, o bloco inteiro vira um
 * link de área (mesmo tratamento de clique do menu). O número vem pronto: "0" só quando a consulta
 * respondeu; sem base, quem chama passa "—".
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
  link,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  link?: { href: string; onNavigate: () => void };
}) {
  const body = (
    <>
      <span className="ui-tile-label">{label}</span>
      <strong className="ui-tile-value">{value}</strong>
      {hint ? <span className="ui-tile-hint">{hint}</span> : null}
    </>
  );
  return link ? (
    <ActionLink
      className={`ui-tile ui-tile-${tone}`}
      href={link.href}
      onNavigate={link.onNavigate}
    >
      {body}
    </ActionLink>
  ) : (
    <div className={`ui-tile ui-tile-${tone}`}>{body}</div>
  );
}
