import { useEffect, useState, type FormEvent } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { ContainerGateway } from '../../batches/application/containerGateway';
import type { ContainerPage } from '../../batches/domain/container';
import { containerPath } from '../domain/label';
import { formatCivilDate } from '../../../shared/format/dates';

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
  const [query, setQuery] = useState({
    search: '',
    after: null as ContainerPage['next'],
  });
  const [page, setPage] = useState<ContainerPage | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void containers
      .list(
        { organizationId, establishmentId },
        { ...query, includeDepleted: true },
      )
      .then(
        (next) => {
          if (active) setPage(next);
        },
        () => {
          if (active) setError(true);
        },
      );
    return () => {
      active = false;
    };
  }, [containers, query, organizationId, establishmentId, revision, retry]);

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
          <p className="mesa-panel-message">Nenhum recipiente encontrado.</p>
        )}
        {!error && page && page.rows.length > 0 && (
          <table className="mesa-table">
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Código</th>
                <th scope="col">Validade</th>
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
