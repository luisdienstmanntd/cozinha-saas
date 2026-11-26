import type { ReactNode } from 'react';

/**
 * PR-03 (M2): cabeçalho único de página. Sempre h2 (o h1 é a marca do app), com descrição opcional,
 * ação principal e ações secundárias.
 */
export function PageHeader({
  title,
  description,
  primary,
  secondary,
}: {
  title: string;
  description?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {primary || secondary ? (
        <div className="ui-page-actions">
          {secondary}
          {primary}
        </div>
      ) : null}
    </header>
  );
}
