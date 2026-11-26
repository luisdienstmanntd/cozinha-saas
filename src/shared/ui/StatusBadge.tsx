import type { ReactNode } from 'react';

export type BadgeStatus =
  'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'depleted' | 'blocked';

// O símbolo reforça a cor, mas o texto sempre diz a situação (a cor nunca é o único sinal).
const symbols: Record<BadgeStatus, string> = {
  overdue: '⛔',
  today: '⚠',
  tomorrow: '●',
  upcoming: '✓',
  depleted: '○',
  blocked: '⛔',
};

/**
 * PR-03 (M3): selo único de situação. Recebe o status já calculado (`getExpiryStatus`) e o texto já
 * montado (`expiryBadgeText`); não calcula validade.
 */
export function StatusBadge({
  status,
  children,
}: {
  status: BadgeStatus;
  children: ReactNode;
}) {
  return (
    <span className={`ui-badge ui-badge-${status}`}>
      <span aria-hidden="true">{symbols[status]}</span> {children}
    </span>
  );
}
