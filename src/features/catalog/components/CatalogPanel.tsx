import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogGateway } from '../application/catalogGateway';
import {
  parseCatalogInput,
  parseStorageCondition,
  storageConditions,
  storageLabels,
  units,
} from '../domain/catalog';
import type {
  CatalogItem,
  CatalogKind,
  CatalogScope,
  StorageCondition,
} from '../domain/catalog';

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

// Fatia 7.3: preparação própria tem seção própria; o recebimento continua só com produtos.
const TEXTS: Record<
  CatalogKind,
  {
    title: string;
    nameLabel: string;
    empty: string;
    created: string;
    submit: string;
  }
> = {
  products: {
    title: 'Produtos',
    nameLabel: 'Nome do produto',
    empty: 'Nenhum produto cadastrado.',
    created: 'Produto cadastrado.',
    submit: 'Cadastrar produto',
  },
  suppliers: {
    title: 'Fornecedores',
    nameLabel: 'Nome do fornecedor',
    empty: 'Nenhum fornecedor cadastrado.',
    created: 'Fornecedor cadastrado.',
    submit: 'Cadastrar fornecedor',
  },
  preparations: {
    title: 'Preparações próprias',
    nameLabel: 'Nome da preparação',
    empty: 'Nenhuma preparação cadastrada.',
    created: 'Preparação cadastrada.',
    submit: 'Cadastrar preparação',
  },
};

const STORAGE_HINT =
  'A conservação é definida uma vez e não pode ser trocada depois. Ela é exigida em todo recebimento do produto.';

const PREPARATION_STORAGE_HINT =
  'A conservação é definida uma vez e não pode ser trocada depois. Ela vale para toda produção desta preparação.';

// Produto sem conservação (cadastrado antes da 6.5a ou cuja definição falhou): o proprietário define
// aqui, uma única vez. Sem ela, o produto não pode ser recebido.
function DefineStorage({
  item,
  onDefine,
}: {
  item: CatalogItem;
  onDefine: (condition: StorageCondition) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <span>
      {' '}
      <label>
        Conservação de {item.name}{' '}
        <select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="" disabled>
            Selecione
          </option>
          {storageConditions.map((condition) => (
            <option key={condition} value={condition}>
              {storageLabels[condition]}
            </option>
          ))}
        </select>
      </label>{' '}
      <button
        type="button"
        disabled={busy || !value}
        onClick={() => {
          setBusy(true);
          setError('');
          let condition: StorageCondition;
          try {
            condition = parseStorageCondition(value);
          } catch (cause) {
            setError(message(cause, 'Selecione a conservação do produto.'));
            setBusy(false);
            return;
          }
          void onDefine(condition)
            .catch((cause: unknown) =>
              setError(message(cause, 'Não foi possível definir.')),
            )
            .finally(() => setBusy(false));
        }}
      >
        Definir conservação
      </button>
      {error && <span role="alert"> {error}</span>}
    </span>
  );
}

function CatalogSection({
  gateway,
  scope: { organizationId, establishmentId },
  canCreate,
  onCreated,
  kind,
}: Props & { kind: CatalogKind }) {
  const product = kind !== 'suppliers';
  const text = TEXTS[kind];
  const title = text.title;
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Fatia 7.3: o cadastro de preparação abre por escolha, para não repetir na tela os campos do produto.
  const [formOpen, setFormOpen] = useState(kind !== 'preparations');

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
      const storage = product
        ? parseStorageCondition(values.get('storageCondition'))
        : null;
      const created = await gateway.create(
        kind,
        { organizationId, establishmentId },
        input,
      );
      let item = created;
      let storageError = '';
      if (storage) {
        try {
          item = {
            ...created,
            storage_condition: await gateway.setStorageCondition(
              { organizationId, establishmentId },
              created.id,
              storage,
            ),
          };
        } catch (cause) {
          storageError = message(cause, 'Conservação não definida.');
        }
      }
      setList((previous) =>
        previous.status === 'ready'
          ? { status: 'ready', items: [...previous.items, item] }
          : previous,
      );
      form.reset();
      onCreated?.();
      if (storageError)
        setError(
          kind === 'preparations'
            ? `Preparação cadastrada, mas a conservação não foi definida: ${storageError} Defina na lista antes de registrar a produção.`
            : `Produto cadastrado, mas a conservação não foi definida: ${storageError} Defina na lista antes de receber.`,
        );
      else {
        setNotice(text.created);
        if (kind === 'preparations') setFormOpen(false);
      }
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
            <p>{text.empty}</p>
          ) : (
            <ul>
              {list.items.map((item) => (
                <li key={item.id}>
                  {item.name}
                  {item.unit && ` — ${item.unit}`}
                  {product &&
                    (item.storage_condition
                      ? ` — ${storageLabels[item.storage_condition]}`
                      : ' — conservação não definida')}
                  {product && !item.storage_condition && canCreate && (
                    <DefineStorage
                      item={item}
                      onDefine={async (condition) => {
                        const saved = await gateway.setStorageCondition(
                          { organizationId, establishmentId },
                          item.id,
                          condition,
                        );
                        setList((previous) =>
                          previous.status === 'ready'
                            ? {
                                status: 'ready',
                                items: previous.items.map((row) =>
                                  row.id === item.id
                                    ? { ...row, storage_condition: saved }
                                    : row,
                                ),
                              }
                            : previous,
                        );
                        onCreated?.();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {canCreate && !formOpen && (
            <>
              <button type="button" onClick={() => setFormOpen(true)}>
                Nova preparação
              </button>
              {notice && <p role="status">{notice}</p>}
            </>
          )}
          {canCreate && formOpen && (
            <form onSubmit={(event) => void submit(event)}>
              <p>
                <label>
                  {text.nameLabel}{' '}
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
              {product && (
                <p>
                  <label>
                    Conservação{' '}
                    <select name="storageCondition" defaultValue="" required>
                      <option value="" disabled>
                        Selecione
                      </option>
                      {storageConditions.map((condition) => (
                        <option key={condition} value={condition}>
                          {storageLabels[condition]}
                        </option>
                      ))}
                    </select>
                  </label>{' '}
                  {kind === 'preparations'
                    ? PREPARATION_STORAGE_HINT
                    : STORAGE_HINT}
                </p>
              )}
              <button disabled={saving}>{text.submit}</button>
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
      <CatalogSection {...props} kind="preparations" />
    </div>
  );
}
