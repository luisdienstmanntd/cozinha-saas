import { useEffect, useState, type FormEvent } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { ContainerGateway } from '../../batches/application/containerGateway';
import type { ContainerPage } from '../../batches/domain/container';
import { containerPath } from '../domain/label';
import { formatCivilDate } from '../../../shared/format/dates';
import { formatQuantity } from '../../../shared/format/quantity';
import {
  expiryBadgeText,
  getExpiryStatus,
} from '../../batches/domain/expiryStatus';
import { StatusBadge } from '../../../shared/ui/StatusBadge';

export function LabelDirectory({
  scope: { organizationId, establishmentId },
  containers,
  revision,
}: {
  scope: CatalogScope;
  containers: ContainerGateway;
  revision: number;
}) {
  const [input, setInput] = useState('');
  // PR-07: por padrão só recipientes com saldo; esgotados aparecem ao desmarcar (a lista antiga
  // sempre os incluía, sem dizer a situação).
  const [onlyBalance, setOnlyBalance] = useState(true);
  const [query, setQuery] = useState({
    search: '',
    after: null as ContainerPage['next'],
  });
  const [page, setPage] = useState<ContainerPage | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void containers
      .list(
        { organizationId, establishmentId },
        { ...query, includeDepleted: !onlyBalance },
      )
      .then(
        (next) => {
          if (!active) return;
          setNow(new Date());
          setPage(next);
        },
        () => {
          if (active) setError(true);
        },
      );
    return () => {
      active = false;
    };
  }, [
    containers,
    query,
    onlyBalance,
    organizationId,
    establishmentId,
    revision,
    retry,
  ]);

  // A busca vai ao servidor; espera a digitação parar (300 ms, como em Validades). Enter e "Buscar"
  // consultam na hora.
  useEffect(() => {
    const search = input.trim();
    if (search === query.search) return;
    const timer = window.setTimeout(() => {
      setPage(null);
      setError(false);
      setQuery({ search, after: null });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [input, query.search]);

  function change(next: typeof query) {
    setPage(null);
    setError(false);
    setQuery(next);
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    change({ search: input.trim(), after: null });
  }

  return (
    <section>
      <header className="mesa-page-heading">
        <h2>Etiquetas</h2>
        <p>
          Encontre recipientes e abra a ficha para consultar ou baixar a
          etiqueta.
        </p>
      </header>
      <div className="mesa-panel">
        <form className="mesa-panel-heading" onSubmit={search}>
          <label>
            Produto, lote ou código{' '}
            <input
              type="search"
              value={input}
              maxLength={120}
              onChange={(event) => setInput(event.target.value)}
            />
          </label>
          <button type="submit" className="secondary">
            Buscar
          </button>
          <label>
            <input
              type="checkbox"
              checked={onlyBalance}
              onChange={(event) => {
                setPage(null);
                setError(false);
                setQuery({ ...query, after: null });
                setOnlyBalance(event.target.checked);
              }}
            />{' '}
            Só com saldo
          </label>
        </form>
        {error && (
          <p role="alert" className="mesa-panel-message">
            Falha ao consultar etiquetas.{' '}
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setError(false);
                setRetry(retry + 1);
              }}
            >
              Tentar novamente
            </button>
          </p>
        )}
        {!error && !page && (
          <p role="status" className="mesa-panel-message">
            Carregando recipientes…
          </p>
        )}
        {!error && page?.rows.length === 0 && (
          <p className="mesa-panel-message">
            {onlyBalance
              ? 'Nenhum recipiente com saldo encontrado. Desmarque "Só com saldo" para ver os esgotados.'
              : 'Nenhum recipiente encontrado.'}
          </p>
        )}
        {!error && page && page.rows.length > 0 && (
          <table className="mesa-table">
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Código</th>
                <th scope="col">Validade</th>
                <th scope="col">Saldo</th>
                <th scope="col">Situação</th>
                <th scope="col">Etiqueta</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <tr key={row.container_id}>
                  <td data-label="Produto">{row.product_name}</td>
                  <td data-label="Código">{row.short_code}</td>
                  <td data-label="Validade">
                    {formatCivilDate(row.expiry_date)}
                  </td>
                  <td data-label="Saldo">
                    {formatQuantity(row.balance)} {row.unit}
                  </td>
                  <td data-label="Situação">
                    {row.balance <= 0 ? (
                      <StatusBadge status="depleted">Esgotado</StatusBadge>
                    ) : (
                      <StatusBadge
                        status={getExpiryStatus(
                          row.expiry_date,
                          row.timezone,
                          now,
                        )}
                      >
                        {expiryBadgeText(row.expiry_date, row.timezone, now)}
                      </StatusBadge>
                    )}
                  </td>
                  <td data-label="Etiqueta">
                    <a href={containerPath(row.container_id)}>Abrir ficha</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mesa-panel-heading mesa-action-row">
          {query.after && (
            <button
              type="button"
              className="secondary"
              onClick={() => change({ ...query, after: null })}
            >
              Primeira página
            </button>
          )}
          {page?.next && (
            <button
              type="button"
              className="secondary"
              onClick={() => change({ ...query, after: page.next })}
            >
              Próxima página
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
