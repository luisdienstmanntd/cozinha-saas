import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import { storageConditions, storageLabels } from '../../catalog/domain/catalog';
import type { StorageCondition } from '../../catalog/domain/catalog';
import type { LocationGateway } from '../application/locationGateway';
import { LocationRejected } from '../application/locationGateway';
import { NAME_MAX } from '../domain/locations';
import type { StorageLocation } from '../domain/locations';

// Locais da unidade (D-030). O proprietário cria e desativa; os demais só veem. Local desativado deixa
// de aceitar recipientes, mas continua no histórico. Nada é apagado.
export function LocationsPanel({
  scope,
  gateway,
  canManage,
  onChanged,
}: {
  scope: CatalogScope;
  gateway: LocationGateway;
  canManage: boolean;
  onChanged?: () => void;
}) {
  const [locations, setLocations] = useState<StorageLocation[] | null>(null);
  const [name, setName] = useState('');
  const [condition, setCondition] = useState<StorageCondition>('refrigerated');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Um identificador por tentativa de criação; um novo só depois de sucesso ou recusa definitiva.
  const intent = useRef(crypto.randomUUID());

  const { organizationId, establishmentId } = scope;
  function load() {
    gateway.list({ organizationId, establishmentId }).then(setLocations, () => {
      setLocations([]);
      setError('Não foi possível carregar os locais.');
    });
  }
  useEffect(load, [organizationId, establishmentId, gateway]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await gateway.create(scope, {
        name,
        condition,
        intentId: intent.current,
      });
      intent.current = crypto.randomUUID();
      setName('');
      load();
      onChanged?.();
    } catch (cause) {
      if (cause instanceof LocationRejected) {
        // A recusa não gravou nada: a próxima tentativa pode ter outro identificador.
        if (!cause.conflict) intent.current = crypto.randomUUID();
        setError(cause.message);
      } else
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível concluir.',
        );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(location: StorageLocation) {
    setError('');
    setBusy(true);
    try {
      await gateway.setActive(scope, location.id, !location.active);
      load();
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível concluir.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="locations-title">
      <h3 id="locations-title">Locais de armazenamento</h3>
      <p>
        Locais ajudam a achar o recipiente na cozinha. Mudar de local não altera
        saldo, validade nem conservação.
      </p>
      {error && <p role="alert">{error}</p>}
      {locations === null ? (
        <p>Carregando locais…</p>
      ) : locations.length === 0 ? (
        <p>Nenhum local cadastrado nesta unidade.</p>
      ) : (
        <ul>
          {locations.map((location) => (
            <li key={location.id}>
              {location.name} — {storageLabels[location.condition]}
              {!location.active && <em> (desativado)</em>}
              {canManage && (
                <>
                  {' '}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggle(location)}
                  >
                    {location.active ? 'Desativar' : 'Reativar'} {location.name}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form onSubmit={(event) => void create(event)}>
          <label>
            Nome do local
            <input
              value={name}
              maxLength={NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label>
            Condição do local
            <select
              value={condition}
              onChange={(event) =>
                setCondition(event.target.value as StorageCondition)
              }
            >
              {storageConditions.map((value) => (
                <option key={value} value={value}>
                  {storageLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy || name.trim() === ''}>
            Criar local
          </button>
        </form>
      )}
    </section>
  );
}
