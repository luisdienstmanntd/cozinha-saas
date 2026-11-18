import type { ReactNode } from 'react';

/**
 * V4 (M11, D-062): orientação geral e repetitiva recolhida em "Saiba mais". Nunca usar para alerta de
 * validade, bloqueio, vencimento, responsabilidade, permissão, limitação do saldo físico ou informação
 * necessária para confirmar operação crítica: esses ficam sempre visíveis.
 */
export function MoreInfo({
  summary = 'Saiba mais',
  children,
}: {
  summary?: string;
  children: ReactNode;
}) {
  return (
    <details className="more-info">
      <summary>{summary}</summary>
      {children}
    </details>
  );
}
