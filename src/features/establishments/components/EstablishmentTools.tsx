import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Access } from '../../identity/domain/identity';
import {
  EstablishmentUncertain,
  type EstablishmentGateway,
} from '../application/establishmentGateway';
import {
  parseEstablishmentName,
  parseNewEstablishment,
  summarizeMemberships,
  timezoneLabel,
} from '../domain/establishment';
import type { NewEstablishment } from '../domain/establishment';
import { brazilTimezones, defaultTimezone } from '../domain/timezones';

type Props = {
  gateway: EstablishmentGateway;
  organization: Access[number];
  owner: boolean;
  onChanged: (message: string, kind?: 'notice' | 'error') => Promise<void>;
  /** Another access action is running; block writes to avoid racing it. */
  busy?: boolean;
};

function text(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : 'Não foi possível concluir. Tente novamente.';
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function EstablishmentTools({
  gateway,
  organization,
  owner,
  onChanged,
  busy = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState<string>(defaultTimezone);
  const [review, setReview] = useState<NewEstablishment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const confirmation = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const returning = useRef(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (review) confirmation.current?.focus();
    else if (returning.current) {
      returning.current = false;
      nameInput.current?.focus();
    }
  }, [review]);

  // Members only read their own membership (RLS), so management stays owner-only.
  if (!owner) return null;
  const summary = summarizeMemberships(organization.memberships);
  const blocked = saving || busy;
  const headingId = `unidades-${organization.id}`;
  const toggle = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={headingId + '-painel'}
      onClick={() => setOpen((value) => !value)}
    >
      {open ? 'Fechar' : 'Gerenciar'} unidades de {organization.name}
    </button>
  );
  if (!open) return toggle;

  async function save(action: () => Promise<void>) {
    // A ref (not state) blocks a second click in the same tick.
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof EstablishmentUncertain) {
        setReview(null);
        await onChanged(cause.message, 'error');
        return;
      }
      setError(text(cause));
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function startReview(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      setReview(parseNewEstablishment(name, timezone));
    } catch (cause) {
      setError(text(cause));
    }
  }

  function confirm() {
    if (!review) return;
    const input = review;
    void save(async () => {
      await gateway.create(organization.id, input);
      if (mounted.current) await onChanged(`Unidade ${input.name} criada.`);
    });
  }

  function rename(
    event: FormEvent<HTMLFormElement>,
    unitId: string,
    unitName: string,
  ) {
    event.preventDefault();
    setError('');
    let value: string;
    try {
      value = parseEstablishmentName(
        new FormData(event.currentTarget).get('name'),
      );
    } catch (cause) {
      setError(`${unitName}: ${text(cause)}`);
      return;
    }
    void save(async () => {
      await gateway.rename(organization.id, unitId, value);
      if (mounted.current) await onChanged('Nome da unidade atualizado.');
    });
  }

  return (
    <>
      {toggle}
      <section
        id={headingId + '-painel'}
        className="establishment-tools"
        aria-labelledby={headingId}
      >
        <h3 id={headingId}>Unidades de {organization.name}</h3>
        <p>
          Vínculos ativos:{' '}
          {plural(summary.owners, 'proprietário', 'proprietários')} e{' '}
          {plural(summary.members, 'colaborador', 'colaboradores')}. Convites e
          revogações ainda são feitos pelo responsável pelos testes.
        </p>
        <p className="hint">
          O fuso de uma unidade é escolhido na criação e não é alterado por esta
          tela, porque mudaria a classificação de validade dos recebimentos já
          registrados.
        </p>
        {error && <p role="alert">{error}</p>}
        {organization.establishments.length > 0 && (
          <ul className="establishment-list">
            {organization.establishments.map((unit) => (
              <li key={unit.id}>
                <form onSubmit={(event) => rename(event, unit.id, unit.name)}>
                  <label>
                    Novo nome para {unit.name}{' '}
                    <input
                      name="name"
                      defaultValue={unit.name}
                      maxLength={120}
                      required
                    />
                  </label>{' '}
                  <button disabled={blocked}>Renomear {unit.name}</button>
                </form>
                <p className="hint">Fuso: {timezoneLabel(unit.timezone)}</p>
              </li>
            ))}
          </ul>
        )}
        {review ? (
          <div
            ref={confirmation}
            tabIndex={-1}
            role="group"
            aria-label="Confirmar nova unidade"
            className="creation-review"
          >
            <p>
              Criar a unidade <strong>{review.name}</strong> com fuso{' '}
              {timezoneLabel(review.timezone)}? Depois de criada, a unidade não
              pode ser excluída e o fuso não pode ser alterado por esta tela.
            </p>
            <button type="button" disabled={blocked} onClick={confirm}>
              Confirmar criação
            </button>{' '}
            <button
              type="button"
              disabled={blocked}
              onClick={() => {
                returning.current = true;
                setReview(null);
              }}
            >
              Voltar e corrigir
            </button>
          </div>
        ) : (
          <form onSubmit={startReview}>
            <p>
              <label>
                Nome da nova unidade{' '}
                <input
                  ref={nameInput}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  required
                />
              </label>
            </p>
            <p>
              <label>
                Fuso horário da nova unidade{' '}
                <select
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                >
                  {brazilTimezones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.label} ({zone.id})
                    </option>
                  ))}
                </select>
              </label>
            </p>
            <button disabled={blocked}>Revisar nova unidade</button>
          </form>
        )}
      </section>
    </>
  );
}
