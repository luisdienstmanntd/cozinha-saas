import { SupplierActions } from './SupplierActions';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogGateway } from '../application/catalogGateway';
import {
  parseCatalogInput,
  parseStorageCondition,
  storageConditions,
  storageLabels,
  units,
} from '../domain/catalog';
import { durationText } from '../../settings/domain/settings';
import type {
  CatalogItem,
  CatalogKind,
  CatalogScope,
  StorageCondition,
} from '../domain/catalog';

type Props = {
  sectionIds?: readonly [string, string, string];
  page?: CatalogKind | null;
  active?: boolean;
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
  const [confirming, setConfirming] = useState(false);
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onDefine(parseStorageCondition(value));
    } catch (cause) {
      setError(message(cause, 'Não foi possível definir.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mesa-panel-message">
      <p>
        <label>
          Conservação de {item.name}{' '}
          <select
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setConfirming(false);
            }}
          >
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
      </p>
      {!confirming ? (
        <button
          type="button"
          disabled={busy || !value}
          onClick={() => setConfirming(true)}
        >
          Revisar conservação
        </button>
      ) : (
        <>
          <p role="status">
            {storageLabels[parseStorageCondition(value)]} para {item.name}. Esta
            definição vale para todos os recebimentos e não poderá ser alterada
            depois.
          </p>
          <div className="mesa-action-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm()}
            >
              Confirmar conservação de {item.name}
            </button>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

// Fatia 7.7: janela de registro da produção própria da preparação. Sem ela, vale a da unidade (7.6).
// O sistema não sugere valor; o proprietário define, e o banco audita.
function PreparationWindow({
  item,
  onSave,
}: {
  item: CatalogItem;
  onSave: (minutes: number | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const own = item.production_window_minutes ?? null;
  const parsed = /^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : null;
  const valid = parsed !== null && parsed >= 15 && parsed <= 1440;
  function save(minutes: number | null) {
    setBusy(true);
    setError('');
    void onSave(minutes)
      .then(() => setOpen(false))
      .catch((cause: unknown) =>
        setError(message(cause, 'Não foi possível salvar a janela.')),
      )
      .finally(() => setBusy(false));
  }
  if (!open)
    return (
      <>
        {' '}
        {/* V4 (D3): rótulo visível curto; o nome acessível mantém a preparação. */}
        <button
          className="secondary"
          type="button"
          aria-label={`Janela de registro de ${item.name}`}
          onClick={() => {
            setValue(own === null ? '' : String(own));
            setError('');
            setOpen(true);
          }}
        >
          Janela de registro
        </button>
      </>
    );
  return (
    <span>
      {' '}
      <label>
        Janela de registro da produção de {item.name} (minutos){' '}
        <input
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>{' '}
      {valid && `(${durationText(parsed)}) `}
      <button
        type="button"
        disabled={busy || !valid}
        aria-label={`Salvar janela de ${item.name}`}
        onClick={() => save(parsed)}
      >
        Salvar janela
      </button>{' '}
      {own !== null && (
        <button
          type="button"
          disabled={busy}
          aria-label={`Usar a janela da unidade em ${item.name}`}
          onClick={() => save(null)}
        >
          Usar a janela da unidade
        </button>
      )}{' '}
      <button
        className="secondary"
        type="button"
        disabled={busy}
        onClick={() => setOpen(false)}
      >
        Cancelar
      </button>{' '}
      Entre 15 minutos e 24 horas. Vale para os registros novos.
      {error && <span role="alert"> {error}</span>}
    </span>
  );
}

function CatalogSection({
  gateway,
  scope: { organizationId, establishmentId },
  canCreate,
  onCreated,
  page,
  active,
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
  const standalone = page !== undefined;
  const [formOpen, setFormOpen] = useState(
    !standalone && kind !== 'preparations',
  );
  // Mesa (D-070): o painel só ganha formulário quando é aberto e o mantém fechado, com o
  // rascunho, até um cadastro concluído. Painéis nunca abertos não deixam campos no documento.
  const [drafting, setDrafting] = useState(false);
  const [search, setSearch] = useState('');
  const [condition, setCondition] = useState('');
  const [pageNumber, setPageNumber] = useState(0);
  const drawer = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const listHeading = useRef<HTMLHeadingElement>(null);
  const actionLabel =
    kind === 'products'
      ? 'Novo produto'
      : kind === 'suppliers'
        ? 'Novo fornecedor'
        : 'Nova preparação';
  const pageSize = 12;
  const filtered =
    list.status === 'ready'
      ? list.items.filter(
          (item) =>
            item.name
              .toLocaleLowerCase('pt-BR')
              .includes(search.trim().toLocaleLowerCase('pt-BR')) &&
            (!condition || (item.storage_condition ?? 'pending') === condition),
        )
      : [];
  const visibleItems = standalone
    ? filtered.slice(pageNumber * pageSize, (pageNumber + 1) * pageSize)
    : filtered;

  useEffect(() => {
    const dialog = drawer.current;
    if (
      !standalone ||
      !dialog ||
      !formOpen ||
      page !== kind ||
      active === false
    )
      return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [standalone, formOpen, page, kind, active]);

  function closeDrawer() {
    drawer.current?.close();
    setFormOpen(false);
    trigger.current?.focus();
  }

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
        values.get('email'),
        values.get('contact'),
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
      if (storageError) {
        setError(
          kind === 'preparations'
            ? `Preparação cadastrada, mas não foi possível confirmar a conservação: ${storageError} Confira o estado na lista antes de tentar novamente.`
            : `Produto cadastrado, mas não foi possível confirmar a conservação: ${storageError} Confira o estado na lista antes de tentar novamente.`,
        );
        if (standalone) {
          closeDrawer();
          setDrafting(false);
          setList({ status: 'loading' });
          setAttempt((value) => value + 1);
        }
      } else {
        setNotice(text.created);
        if (standalone) {
          closeDrawer();
          setDrafting(false);
        } else if (kind === 'preparations') setFormOpen(false);
      }
    } catch (cause) {
      setError(message(cause, 'Falha no cadastro.'));
    } finally {
      setSaving(false);
    }
  }

  const form = (
    <form onSubmit={(event) => void submit(event)}>
      {standalone && <h2 id={headingId}>{actionLabel}</h2>}
      <p>
        <label>
          {text.nameLabel} <input name="name" maxLength={120} required />
        </label>
      </p>
      {kind === 'suppliers' && (
        <>
          <p>
            <label>
              E-mail (opcional){' '}
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
              />
            </label>
          </p>
          <p>
            <label>
              Contato — telefone/WhatsApp (opcional){' '}
              <input
                name="contact"
                type="tel"
                autoComplete="tel"
                maxLength={80}
              />
            </label>
          </p>
        </>
      )}
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
          {kind === 'preparations' ? PREPARATION_STORAGE_HINT : STORAGE_HINT}
        </p>
      )}
      <button disabled={saving}>{text.submit}</button>
      {error && (!standalone || formOpen) && <p role="alert">{error}</p>}
      {standalone && (
        <button
          className="secondary"
          type="button"
          disabled={saving}
          onClick={closeDrawer}
        >
          Fechar
        </button>
      )}
      {!standalone && notice && <p role="status">{notice}</p>}
    </form>
  );
  return (
    <section aria-label={title} hidden={standalone && page !== kind}>
      {standalone ? (
        <header className="mesa-page-heading mesa-catalog-heading">
          <div>
            <h2 ref={listHeading} tabIndex={-1}>
              {title}
            </h2>
            <p>Consulte e mantenha os cadastros desta unidade.</p>
          </div>
          {canCreate && list.status === 'ready' && (
            <button
              ref={trigger}
              type="button"
              onClick={() => {
                setDrafting(true);
                setFormOpen(true);
              }}
            >
              {actionLabel}
            </button>
          )}
        </header>
      ) : (
        <h3 ref={listHeading} tabIndex={-1}>
          {title}
        </h3>
      )}
      {standalone && notice && <p role="status">{notice}</p>}
      {standalone && error && !formOpen && <p role="alert">{error}</p>}
      {standalone && list.status === 'ready' && (
        <div className="mesa-panel mesa-panel-heading">
          <label>
            Pesquisar {title.toLowerCase()}{' '}
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPageNumber(0);
              }}
            />
          </label>
          {product && (
            <label>
              Filtrar por conservação{' '}
              <select
                value={condition}
                onChange={(event) => {
                  setCondition(event.target.value);
                  setPageNumber(0);
                }}
              >
                <option value="">Todas</option>
                {storageConditions.map((value) => (
                  <option key={value} value={value}>
                    {storageLabels[value]}
                  </option>
                ))}
                <option value="pending">Pendente</option>
              </select>
            </label>
          )}
        </div>
      )}
      {list.status === 'loading' && (
        <p role="status">Carregando {title.toLowerCase()}…</p>
      )}
      {list.status === 'error' && (
        <>
          <p role="alert">{list.message}</p>
          <button
            className="secondary"
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
          {visibleItems.length === 0 ? (
            <p>
              {list.items.length === 0
                ? text.empty
                : 'Nenhum cadastro encontrado com esses filtros.'}
            </p>
          ) : (
            <ul
              className={
                standalone ? 'mesa-catalog-list mesa-panel' : undefined
              }
            >
              {visibleItems.map((item) => (
                <li
                  key={item.id}
                  className={kind === 'suppliers' ? 'supplier-row' : undefined}
                >
                  {kind === 'suppliers' ? <span>{item.name}</span> : item.name}
                  {kind === 'suppliers' && (item.email || item.contact) && (
                    <div className="supplier-contact">
                      {item.email && <span>{item.email}</span>}
                      {item.contact && <span>{item.contact}</span>}
                    </div>
                  )}
                  {kind === 'suppliers' && canCreate && (
                    <SupplierActions
                      supplier={item}
                      scope={{ organizationId, establishmentId }}
                      gateway={gateway}
                      active={
                        !standalone || (page === kind && active !== false)
                      }
                      onUpdated={(updated) => {
                        setList((previous) =>
                          previous.status === 'ready'
                            ? {
                                status: 'ready',
                                items: previous.items
                                  .map((row) =>
                                    row.id === updated.id ? updated : row,
                                  )
                                  .sort((a, b) =>
                                    a.name.localeCompare(b.name, 'pt-BR'),
                                  ),
                              }
                            : previous,
                        );
                        listHeading.current?.focus();
                        setNotice('Fornecedor atualizado.');
                        onCreated?.();
                      }}
                      onDeleted={() => {
                        setList((previous) =>
                          previous.status === 'ready'
                            ? {
                                status: 'ready',
                                items: previous.items.filter(
                                  (row) => row.id !== item.id,
                                ),
                              }
                            : previous,
                        );
                        setNotice('Fornecedor excluído.');
                        setPageNumber(0);
                        onCreated?.();
                        listHeading.current?.focus();
                      }}
                    />
                  )}
                  {item.unit && ` — ${item.unit}`}
                  {product &&
                    (item.storage_condition
                      ? ` — ${storageLabels[item.storage_condition]}`
                      : ' — conservação não definida')}
                  {kind === 'preparations' && (
                    <span>
                      {item.production_window_minutes
                        ? ` — janela de registro: ${durationText(item.production_window_minutes)}`
                        : ' — janela de registro: a da unidade'}
                    </span>
                  )}
                  {kind === 'preparations' &&
                    canCreate &&
                    gateway.setProductionWindow && (
                      <PreparationWindow
                        key={`${item.id}:${item.production_window_minutes ?? ''}`}
                        item={item}
                        onSave={async (minutes) => {
                          const saved = await gateway.setProductionWindow!(
                            { organizationId, establishmentId },
                            item.id,
                            minutes,
                          );
                          setList((previous) =>
                            previous.status === 'ready'
                              ? {
                                  status: 'ready',
                                  items: previous.items.map((row) =>
                                    row.id === item.id
                                      ? {
                                          ...row,
                                          production_window_minutes: saved,
                                        }
                                      : row,
                                  ),
                                }
                              : previous,
                          );
                          onCreated?.();
                        }}
                      />
                    )}
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
          {standalone && filtered.length > pageSize && (
            <div className="mesa-action-row">
              <button
                className="secondary"
                type="button"
                disabled={!pageNumber}
                onClick={() => setPageNumber(pageNumber - 1)}
              >
                Anterior
              </button>
              <span>
                Página {pageNumber + 1} de{' '}
                {Math.ceil(filtered.length / pageSize)}
              </span>
              <button
                className="secondary"
                type="button"
                disabled={(pageNumber + 1) * pageSize >= filtered.length}
                onClick={() => setPageNumber(pageNumber + 1)}
              >
                Próxima
              </button>
            </div>
          )}
          {!standalone && canCreate && !formOpen && (
            <>
              <button type="button" onClick={() => setFormOpen(true)}>
                Nova preparação
              </button>
              {notice && <p role="status">{notice}</p>}
            </>
          )}
        </>
      )}
      {canCreate &&
        (standalone ? (
          <dialog
            className="mesa-drawer"
            ref={drawer}
            aria-labelledby={headingId}
            onCancel={(event) => {
              event.preventDefault();
              if (!saving) closeDrawer();
            }}
          >
            {(formOpen || drafting) && form}
          </dialog>
        ) : (
          list.status === 'ready' && formOpen && form
        ))}
    </section>
  );
}

export function CatalogPanel(props: Props) {
  const key = `${props.scope.organizationId}:${props.scope.establishmentId}`;
  return (
    <div key={key}>
      {!props.canCreate && <p>Somente proprietários podem cadastrar itens.</p>}
      <div
        id={props.sectionIds?.[0]}
        className="catalog-destination"
        tabIndex={props.sectionIds ? -1 : undefined}
      >
        <CatalogSection {...props} kind="products" />
      </div>
      <div
        id={props.sectionIds?.[1]}
        className="catalog-destination"
        tabIndex={props.sectionIds ? -1 : undefined}
      >
        <CatalogSection {...props} kind="suppliers" />
      </div>
      <div
        id={props.sectionIds?.[2]}
        className="catalog-destination"
        tabIndex={props.sectionIds ? -1 : undefined}
      >
        <CatalogSection {...props} kind="preparations" />
      </div>
    </div>
  );
}
