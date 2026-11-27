import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogGateway } from '../application/catalogGateway';
import type { CatalogItem, CatalogScope } from '../domain/catalog';
import { parseCatalogInput } from '../domain/catalog';
import { IconButton } from '../../../shared/ui/IconButton';

type Props = {
  supplier: CatalogItem;
  scope: CatalogScope;
  gateway: CatalogGateway;
  active: boolean;
  onUpdated: (item: CatalogItem) => void;
  onDeleted: () => void;
};
export function SupplierActions({
  supplier,
  scope,
  gateway,
  active,
  onUpdated,
  onDeleted,
}: Props) {
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const edit = useRef<HTMLDialogElement>(null),
    remove = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const name = useRef<HTMLInputElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  const title = useId(),
    hint = useId();
  useEffect(() => {
    const dialog =
      mode === 'edit'
        ? edit.current
        : mode === 'delete'
          ? remove.current
          : null;
    if (!dialog || !active) return;
    dialog.showModal();
    if (mode === 'delete') cancel.current?.focus();
    else name.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [mode, active]);
  useEffect(() => {
    if (mode === null && !busy) returnFocus.current?.focus();
  }, [mode, busy]);
  function close() {
    edit.current?.close();
    remove.current?.close();
    setMode(null);
    setError('');
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !gateway.updateSupplier) return;
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const input = parseCatalogInput(
        'suppliers',
        values.get('name'),
        null,
        values.get('email'),
        values.get('contact'),
      );
      const item = await gateway.updateSupplier(scope, supplier.id, input);
      form.reset();
      edit.current?.close();
      onUpdated(item);
      close();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível salvar.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function erase() {
    if (busy || !gateway.deleteSupplier) return;
    setBusy(true);
    setError('');
    try {
      await gateway.deleteSupplier(scope, supplier.id);
      remove.current?.close();
      setMode(null);
      onDeleted();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível excluir.',
      );
    } finally {
      setBusy(false);
    }
  }
  const dismiss = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (!busy) close();
  };
  return (
    <div className="supplier-actions">
      {gateway.updateSupplier && (
        <IconButton
          label={`Editar fornecedor ${supplier.name}`}
          icon="edit"
          disabled={busy}
          onClick={(event) => {
            returnFocus.current = event.currentTarget;
            setMounted(true);
            setError('');
            setMode('edit');
          }}
        />
      )}
      {gateway.deleteSupplier && (
        <IconButton
          label={`Excluir fornecedor ${supplier.name}`}
          icon="delete"
          className="supplier-delete-icon"
          disabled={busy}
          onClick={(event) => {
            returnFocus.current = event.currentTarget;
            setError('');
            setMode('delete');
          }}
        />
      )}
      {mounted && (
        <dialog
          ref={edit}
          className="mesa-drawer"
          aria-labelledby={title}
          onCancel={dismiss}
        >
          <form
            key={`${supplier.name}:${supplier.email}:${supplier.contact}`}
            onSubmit={(event) => void save(event)}
          >
            <h2 id={title}>Editar fornecedor</h2>
            <fieldset disabled={busy}>
              <p>
                <label>
                  Nome do fornecedor{' '}
                  <input
                    ref={name}
                    name="name"
                    required
                    maxLength={120}
                    defaultValue={supplier.name}
                    aria-describedby={hint}
                  />
                </label>
              </p>
              <p id={hint}>
                Depois do primeiro recebimento, o nome fica preservado nas
                etiquetas. E-mail e contato podem ser atualizados.
              </p>
              <p>
                <label>
                  E-mail (opcional){' '}
                  <input
                    name="email"
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    defaultValue={supplier.email ?? ''}
                  />
                </label>
              </p>
              <p>
                <label>
                  Contato — telefone/WhatsApp (opcional){' '}
                  <input
                    name="contact"
                    type="tel"
                    maxLength={80}
                    autoComplete="tel"
                    defaultValue={supplier.contact ?? ''}
                  />
                </label>
              </p>
              {error && mode === 'edit' && <p role="alert">{error}</p>}
              <button type="submit">Salvar alterações</button>{' '}
              <button type="button" className="secondary" onClick={close}>
                Fechar
              </button>
            </fieldset>
          </form>
        </dialog>
      )}
      {mode === 'delete' && (
        <dialog
          ref={remove}
          className="supplier-confirm"
          aria-label={`Excluir fornecedor ${supplier.name}?`}
          onCancel={dismiss}
        >
          <h2>Excluir fornecedor {supplier.name}?</h2>
          <p>
            O fornecedor será removido da lista. Fornecedores com recebimentos
            não podem ser excluídos.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="supplier-confirm-actions">
            <button
              type="button"
              className="secondary"
              ref={cancel}
              disabled={busy}
              onClick={close}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="risk"
              disabled={busy}
              onClick={() => void erase()}
            >
              Excluir fornecedor
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
