import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogGateway } from '../application/catalogGateway';
import { parseCatalogInput, units } from '../domain/catalog';
import type { CatalogItem, CatalogKind, CatalogScope } from '../domain/catalog';

type Props = {
  gateway: CatalogGateway;
  scope: CatalogScope;
  canCreate: boolean;
  onCreated?: () => void;
};
type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: CatalogItem[] };

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function CatalogSection({
  gateway,
  scope: { organizationId, establishmentId },
  canCreate,
  onCreated,
  kind,
}: Props & { kind: CatalogKind }) {
  const product = kind === 'products';
  const singular = product ? 'produto' : 'fornecedor';
  const title = product ? 'Produtos' : 'Fornecedores';
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    void gateway.list(kind, { organizationId, establishmentId }).then(
      (items) => {
        if (current) setList({ status: 'ready', items });
      },
      (cause: unknown) => {
        if (current)
          setList({
            status: 'error',
            message: message(cause, 'Falha na consulta.'),
          });
      },
    );
    return () => {
      current = false;
    };
  }, [attempt, establishmentId, gateway, kind, organizationId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const input = parseCatalogInput(
        kind,
        values.get('name'),
        values.get('unit'),
      );
      const created = await gateway.create(
        kind,
        { organizationId, establishmentId },
        input,
      );
      setList((previous) =>
        previous.status === 'ready'
          ? { status: 'ready', items: [...previous.items, created] }
          : previous,
      );
      form.reset();
      onCreated?.();
      setNotice(product ? 'Produto cadastrado.' : 'Fornecedor cadastrado.');
    } catch (cause) {
      setError(message(cause, 'Falha no cadastro.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      {list.status === 'loading' && (
        <p role="status">Carregando {title.toLowerCase()}…</p>
      )}
      {list.status === 'error' && (
        <>
          <p role="alert">{list.message}</p>
          <button
            onClick={() => {
              setList({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            Tentar novamente
          </button>
        </>
      )}
      {list.status === 'ready' && (
        <>
          {list.items.length >= 1000 && (
            <p role="status">
              A lista mostra até 1.000 itens; outros itens podem não aparecer.
            </p>
          )}
          {list.items.length === 0 ? (
            <p>Nenhum {singular} cadastrado.</p>
          ) : (
            <ul>
              {list.items.map((item) => (
                <li key={item.id}>
                  {item.name}
                  {item.unit && ` — ${item.unit}`}
                </li>
              ))}
            </ul>
          )}
          {canCreate && (
            <form onSubmit={(event) => void submit(event)}>
              <p>
                <label>
                  Nome do {singular}{' '}
                  <input name="name" maxLength={120} required />
                </label>
              </p>
              {product && (
                <p>
                  <label>
                    Unidade de medida{' '}
                    <select name="unit" defaultValue="" required>
                      <option value="" disabled>
                        Selecione
                      </option>
                      {units.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </label>
                </p>
              )}
              <button disabled={saving}>Cadastrar {singular}</button>
              {error && <p role="alert">{error}</p>}
              {notice && <p role="status">{notice}</p>}
            </form>
          )}
        </>
      )}
    </section>
  );
}

export function CatalogPanel(props: Props) {
  const key = `${props.scope.organizationId}:${props.scope.establishmentId}`;
  return (
    <div key={key}>
      {!props.canCreate && <p>Somente proprietários podem cadastrar itens.</p>}
      <CatalogSection {...props} kind="products" />
      <CatalogSection {...props} kind="suppliers" />
    </div>
  );
}
