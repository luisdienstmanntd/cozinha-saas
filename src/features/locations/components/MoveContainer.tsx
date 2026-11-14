import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import { storageLabels } from '../../catalog/domain/catalog';
import type { Member } from '../../handling/domain/family';
import type { LocationGateway } from '../application/locationGateway';
import { LocationRejected } from '../application/locationGateway';
import { MOVE_NOTE } from '../domain/locations';
import type { CurrentLocation, StorageLocation } from '../domain/locations';

// Mudar o recipiente de local. Quem mudou é escolhido entre as pessoas com nome de exibição. Se o banco
// avisar que a condição do local difere da do recipiente, a tela mostra o aviso e só registra com a
// confirmação explícita; nada muda sozinho.
export function MoveContainer({
  scope,
  containerId,
  userId,
  gateway,
  loadMembers,
  setDisplayName,
  current,
  onMoved,
  onClose,
}: {
  scope: CatalogScope;
  containerId: string;
  userId: string;
  gateway: LocationGateway;
  loadMembers: (scope: CatalogScope) => Promise<Member[]>;
  // Define o nome de exibição de quem está logado, quando ainda não tem (o banco exige).
  setDisplayName?: (
    scope: CatalogScope,
    userId: string,
    name: string,
  ) => Promise<string>;
  current: CurrentLocation | undefined;
  onMoved: () => void;
  onClose: () => void;
}) {
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [ownName, setOwnName] = useState('');
  const [everyone, setEveryone] = useState<Member[]>([]);
  const [peopleVersion, setPeopleVersion] = useState(0);
  const [locationId, setLocationId] = useState('');
  const [handledBy, setHandledBy] = useState(userId);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const intent = useRef(crypto.randomUUID());

  const { organizationId, establishmentId } = scope;
  useEffect(() => {
    let active = true;
    const target = { organizationId, establishmentId };
    void Promise.all([gateway.list(target), loadMembers(target)]).then(
      ([places, found]) => {
        if (!active) return;
        setLocations(places.filter((place) => place.active));
        setMembers(found.filter((person) => person.display_name));
        setEveryone(found);
      },
      () => active && setError('Não foi possível carregar locais e pessoas.'),
    );
    return () => {
      active = false;
    };
    // loadMembers é recriada a cada renderização do pai; só o escopo e o gateway recarregam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, establishmentId, gateway, peopleVersion]);

  const needsOwnName =
    setDisplayName !== undefined &&
    everyone.some(
      (person) => person.user_id === userId && !person.display_name,
    );
  async function defineName() {
    setError('');
    setBusy(true);
    try {
      await setDisplayName!(
        { organizationId, establishmentId },
        userId,
        ownName,
      );
      setPeopleVersion((value) => value + 1);
    } catch {
      setError('Não foi possível definir o nome. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }
  async function submit(confirm: boolean, event?: FormEvent) {
    event?.preventDefault();
    setError('');
    setBusy(true);
    try {
      await gateway.move(scope, {
        containerId,
        locationId,
        handledBy,
        confirmMismatch: confirm,
        intentId: intent.current,
      });
      setDone(true);
      onMoved();
    } catch (cause) {
      if (cause instanceof LocationRejected) {
        setNeedsConfirmation(cause.needsConfirmation);
        setError(cause.message);
      } else
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível concluir.',
        );
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div role="status">
        Local registrado.{' '}
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
    );
  const options = locations.filter(
    (place) => place.id !== current?.location_id,
  );
  return (
    <form
      onSubmit={(event) => void submit(false, event)}
      aria-label="Mudar de local"
    >
      <p>
        {current
          ? `Local atual: ${current.location_name}.`
          : 'Sem local registrado.'}{' '}
        {MOVE_NOTE}
      </p>
      <label>
        Novo local
        <select
          value={locationId}
          onChange={(event) => {
            setLocationId(event.target.value);
            setNeedsConfirmation(false);
            setError('');
          }}
          required
        >
          <option value="">Escolha…</option>
          {options.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name} — {storageLabels[place.condition]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quem mudou o recipiente
        <select
          value={handledBy}
          onChange={(event) => setHandledBy(event.target.value)}
        >
          {members.map((person) => (
            <option key={person.user_id} value={person.user_id}>
              {person.display_name}
            </option>
          ))}
        </select>
      </label>
      {needsOwnName && (
        <p>
          <label>
            Seu nome de exibição (até 40 caracteres)
            <input
              value={ownName}
              maxLength={40}
              onChange={(event) => setOwnName(event.target.value)}
            />
          </label>{' '}
          <button
            type="button"
            disabled={busy || ownName.trim() === ''}
            onClick={() => void defineName()}
          >
            Definir nome
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {needsConfirmation ? (
        <button type="button" disabled={busy} onClick={() => void submit(true)}>
          Registrar mesmo assim
        </button>
      ) : (
        <button
          type="submit"
          disabled={busy || locationId === '' || needsOwnName}
        >
          Registrar local
        </button>
      )}{' '}
      <button type="button" onClick={onClose}>
        Cancelar
      </button>
    </form>
  );
}
