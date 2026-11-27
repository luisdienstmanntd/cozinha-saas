import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { TeamRejected, type TeamGateway } from '../application/teamGateway';
import {
  DISPLAY_NAME_MAX,
  EMAIL_MAX,
  GENERIC_FAILURE,
  ROLES,
  memberName,
  roleHints,
  roleLabels,
  splitTeam,
  type Role,
  type TeamMember,
} from '../domain/team';

// D-077: equipe da empresa, só para o proprietário. A tela só mostra e pede; quem autoriza, impede o
// último proprietário de sair e audita é o banco. Nada é apagado: revogar guarda a data, restaurar
// devolve o acesso na mesma linha, como colaborador.

type Pending =
  | { kind: 'revoke'; member: TeamMember }
  | { kind: 'role'; member: TeamMember; role: Role };

function shortDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

// Sem nome de exibição, o e-mail já é o nome; não repete.
function contact(member: TeamMember) {
  return member.display_name && member.email ? `${member.email} · ` : '';
}

function messageOf(cause: unknown) {
  return cause instanceof TeamRejected ? cause.message : GENERIC_FAILURE;
}

export function TeamPanel({
  organizationId,
  organizationName,
  timezone,
  gateway,
  onChanged,
}: {
  organizationId: string;
  organizationName: string;
  timezone: string;
  gateway: TeamGateway;
  onChanged?: () => void;
}) {
  const titleId = useId();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [pending, setPending] = useState<Pending | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    let active = true;
    gateway.list(organizationId).then(
      (rows) => {
        if (!active) return;
        setMembers(rows);
        setLoadFailed(false);
      },
      () => {
        if (active) setLoadFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [gateway, organizationId, reload]);

  async function act(run: () => Promise<unknown>, done: string) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await run();
      setNotice(done);
      setPending(null);
      setRenaming(null);
      setReload((value) => value + 1);
      onChanged?.();
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const name = displayName.trim();
    const ok = await act(
      () => gateway.add(organizationId, { email, displayName: name, role }),
      `${name} entrou na equipe com o papel ${roleLabels[role]}.`,
    );
    if (ok) {
      setEmail('');
      setDisplayName('');
      setRole('member');
      setFormOpen(false);
    }
  }

  async function rename(event: FormEvent, member: TeamMember) {
    event.preventDefault();
    await act(
      () => gateway.rename(organizationId, member.user_id, newName),
      `Nome atualizado para ${newName.trim()}.`,
    );
  }

  async function confirm() {
    if (!pending) return;
    const name = memberName(pending.member);
    if (pending.kind === 'revoke')
      await act(
        () => gateway.revoke(organizationId, pending.member.user_id),
        `O acesso de ${name} foi revogado.`,
      );
    else {
      const next = pending.role;
      await act(
        () => gateway.setRole(organizationId, pending.member.user_id, next),
        `Papel de ${name} alterado para ${roleLabels[next]}.`,
      );
    }
  }

  const team = members ? splitTeam(members) : null;
  const owners = team?.active.filter((m) => m.role === 'owner').length ?? 0;

  return (
    <section className="mesa-overview team-page" aria-labelledby={titleId}>
      <header className="mesa-page-heading mesa-catalog-heading">
        <div>
          <h2 id={titleId}>Equipe</h2>
          <p>
            Pessoas com acesso a {organizationName}. Adicione quem entrou,
            ajuste o papel e revogue o acesso de quem saiu.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={formOpen}
          onClick={() => {
            setFormOpen(!formOpen);
            setError('');
          }}
        >
          {formOpen ? 'Fechar' : 'Adicionar pessoa'}
        </button>
      </header>

      {formOpen && (
        <form
          className="mesa-panel team-form"
          aria-label="Adicionar pessoa"
          onSubmit={(event) => void add(event)}
        >
          <p className="mesa-panel-message">
            A pessoa precisa de uma conta de acesso já criada e confirmada.
            Informe o e-mail dessa conta.
          </p>
          <div className="team-form-fields">
            <label>
              E-mail da conta
              <input
                type="email"
                autoComplete="off"
                value={email}
                maxLength={EMAIL_MAX}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Nome de exibição
              <input
                value={displayName}
                maxLength={DISPLAY_NAME_MAX}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
              <small>Aparece nos registros. Prefira nome curto.</small>
            </label>
            <fieldset>
              <legend>Papel</legend>
              {ROLES.map((value) => (
                <label key={value} className="team-role-option">
                  <input
                    type="radio"
                    name="team-role"
                    value={value}
                    checked={role === value}
                    onChange={() => setRole(value)}
                  />
                  <span>
                    {roleLabels[value]}
                    <small>{roleHints[value]}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
          <p className="mesa-panel-message">
            <button
              type="submit"
              disabled={
                busy || email.trim() === '' || displayName.trim() === ''
              }
            >
              Adicionar à equipe
            </button>
          </p>
        </form>
      )}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {loadFailed && (
        <div className="mesa-panel">
          <p role="alert" className="mesa-panel-message">
            Não foi possível carregar a equipe.
          </p>
          <p className="mesa-panel-message">
            <button
              type="button"
              className="secondary"
              onClick={() => setReload((value) => value + 1)}
            >
              Tentar novamente
            </button>
          </p>
        </div>
      )}
      {!loadFailed && team === null && <p role="status">Carregando equipe…</p>}

      {team && (
        <section className="mesa-panel" aria-label="Pessoas com acesso">
          <header className="mesa-panel-heading">
            <h3>Com acesso ({team.active.length})</h3>
          </header>
          <ul className="mesa-catalog-list team-list">
            {team.active.map((member) => {
              const name = memberName(member);
              const lastOwner = member.role === 'owner' && owners <= 1;
              const otherRole: Role =
                member.role === 'owner' ? 'member' : 'owner';
              return (
                <li key={member.user_id} aria-label={name}>
                  <div className="team-person">
                    <strong>{name}</strong>
                    {member.is_self && <span className="team-badge">Você</span>}
                    <span className="team-role">{roleLabels[member.role]}</span>
                    <small>
                      {contact(member)}desde{' '}
                      {shortDate(member.created_at, timezone)}
                    </small>
                  </div>
                  {renaming === member.user_id ? (
                    <form
                      className="mesa-action-row"
                      aria-label={`Editar nome de ${name}`}
                      onSubmit={(event) => void rename(event, member)}
                    >
                      <label>
                        Novo nome de exibição
                        <input
                          value={newName}
                          maxLength={DISPLAY_NAME_MAX}
                          onChange={(event) => setNewName(event.target.value)}
                          required
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={busy || newName.trim() === ''}
                      >
                        Salvar nome
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setRenaming(null)}
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : pending?.member.user_id === member.user_id ? (
                    <div
                      className="team-confirm"
                      role="group"
                      aria-label={
                        pending.kind === 'revoke'
                          ? `Confirmar revogação de ${name}`
                          : `Confirmar novo papel de ${name}`
                      }
                    >
                      <p>
                        {pending.kind === 'revoke'
                          ? `${name} perde o acesso na hora, inclusive se estiver com o aplicativo aberto. Os registros feitos por essa pessoa continuam no histórico.`
                          : pending.role === 'owner'
                            ? `${name} passa a gerenciar cadastros, equipe e todas as operações.`
                            : `${name} deixa de gerenciar cadastros, equipe e operações e passa a colaborador.`}
                      </p>
                      <div className="mesa-action-row">
                        <button
                          type="button"
                          className={
                            pending.kind === 'revoke'
                              ? 'risk-confirm'
                              : undefined
                          }
                          disabled={busy}
                          onClick={() => void confirm()}
                        >
                          {pending.kind === 'revoke'
                            ? 'Confirmar revogação'
                            : `Confirmar: tornar ${roleLabels[pending.role].toLowerCase()}`}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => setPending(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mesa-action-row">
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Editar nome de ${name}`}
                        disabled={busy}
                        onClick={() => {
                          setPending(null);
                          setRenaming(member.user_id);
                          setNewName(member.display_name ?? '');
                        }}
                      >
                        Editar nome
                      </button>
                      {!member.is_self && (
                        <>
                          <button
                            type="button"
                            className="secondary"
                            aria-label={`Tornar ${name} ${roleLabels[otherRole].toLowerCase()}`}
                            disabled={busy || lastOwner}
                            onClick={() => {
                              setRenaming(null);
                              setPending({
                                kind: 'role',
                                member,
                                role: otherRole,
                              });
                            }}
                          >
                            Tornar {roleLabels[otherRole].toLowerCase()}
                          </button>
                          <button
                            type="button"
                            className="risk"
                            aria-label={`Revogar acesso de ${name}`}
                            disabled={busy || lastOwner}
                            onClick={() => {
                              setRenaming(null);
                              setPending({ kind: 'revoke', member });
                            }}
                          >
                            Revogar acesso
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mesa-panel-message team-footnote">
            Você não pode alterar o próprio papel nem revogar o próprio acesso.
            A empresa sempre mantém pelo menos um proprietário.
          </p>
        </section>
      )}

      {team && team.revoked.length > 0 && (
        <details className="mesa-panel team-revoked">
          <summary className="mesa-panel-heading">
            Acesso revogado ({team.revoked.length})
          </summary>
          <ul className="mesa-catalog-list team-list">
            {team.revoked.map((member) => {
              const name = memberName(member);
              return (
                <li key={member.user_id} aria-label={name}>
                  <div className="team-person">
                    <strong>{name}</strong>
                    <small>
                      {contact(member)}revogado em{' '}
                      {shortDate(member.revoked_at!, timezone)}
                    </small>
                  </div>
                  <div className="mesa-action-row">
                    <button
                      type="button"
                      className="secondary"
                      aria-label={`Restaurar acesso de ${name}`}
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => gateway.restore(organizationId, member.user_id),
                          `O acesso de ${name} foi restaurado como colaborador.`,
                        )
                      }
                    >
                      Restaurar acesso
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mesa-panel-message team-footnote">
            Quem tem o acesso restaurado volta como colaborador.
          </p>
        </details>
      )}
    </section>
  );
}
