import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { IdentityGateway } from '../application/identityGateway';
import type { Access } from '../domain/identity';
import { credentials, organizationName } from '../domain/identity';

export function IdentityHome({
  gateway,
  renderCatalog,
}: {
  gateway: IdentityGateway;
  renderCatalog?: (
    organizationId: string,
    establishmentId: string,
    canCreate: boolean,
  ) => ReactNode;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [access, setAccess] = useState<Access>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [catalogUnit, setCatalogUnit] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(
    () =>
      gateway.onSignOut(() => {
        generation.current++;
        setUserId(null);
        setAccess([]);
        setCatalogUnit(null);
        setPassword('');
        setBusy(false);
        setNotice('');
        setError('Sessão encerrada. Entre novamente.');
      }),
    [gateway],
  );

  async function run(action: () => Promise<void>) {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (cause) {
      if (current === generation.current) {
        setAccess([]);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível concluir. Tente novamente.',
        );
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  async function refresh(current: number) {
    setAccess([]);
    const rows = await gateway.load();
    if (current !== generation.current) return;
    if (rows.length === 0)
      throw new Error('Nenhum vínculo ativo. Solicite acesso ao responsável.');
    setAccess(rows);
  }
  function signIn(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const input = credentials.safeParse({ email, password });
      if (!input.success) throw new Error('Informe e-mail válido e senha.');
      const current = generation.current;
      const id = await gateway.signIn(input.data.email, input.data.password);
      if (current !== generation.current) return;
      setUserId(id);
      setPassword('');
      await refresh(current);
    });
  }

  return (
    <main className="page">
      <h1>Acesso de teste — Cozinha SaaS</h1>
      <p>
        Ambiente local descartável. Contas e vínculos são preparados pelo
        responsável pelos testes.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!userId ? (
        <form onSubmit={signIn}>
          <p>
            <label>
              E-mail{' '}
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          </p>
          <p>
            <label>
              Senha{' '}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          </p>
          <button disabled={busy}>Entrar</button>
        </form>
      ) : (
        <>
          <button
            disabled={busy}
            onClick={() => void run(() => refresh(generation.current))}
          >
            Atualizar acesso
          </button>{' '}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setAccess([]);
                setCatalogUnit(null);
                await gateway.signOut();
                generation.current++;
                setUserId(null);
                setPassword('');
                setBusy(false);
                setError('');
              })
            }
          >
            Sair
          </button>
          {access.map((organization) => {
            const owner = organization.memberships.some(
              (m) => m.user_id === userId && m.role === 'owner',
            );
            return (
              <section key={organization.id}>
                <h2>{organization.name}</h2>
                <p>Papel: {owner ? 'Proprietário' : 'Colaborador'}</p>
                <ul>
                  {organization.establishments.map((unit) => (
                    <li key={unit.id}>
                      {unit.name} — {unit.timezone}
                      {renderCatalog && (
                        <>
                          {' '}
                          <button
                            aria-pressed={catalogUnit === unit.id}
                            onClick={() => setCatalogUnit(unit.id)}
                          >
                            Catálogo de {unit.name}
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {renderCatalog &&
                  organization.establishments
                    .filter((unit) => unit.id === catalogUnit)
                    .map((unit) => (
                      <section
                        key={unit.id}
                        aria-label={`Catálogo de ${unit.name}`}
                      >
                        <h3>Catálogo de {unit.name}</h3>
                        {renderCatalog(organization.id, unit.id, owner)}
                      </section>
                    ))}
                {organization.establishments.length === 0 && (
                  <p>Nenhuma unidade cadastrada.</p>
                )}
                {owner && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = new FormData(event.currentTarget).get(
                        'name',
                      );
                      void run(async () => {
                        const parsed = organizationName.safeParse(value);
                        if (!parsed.success)
                          throw new Error(
                            'Informe nome entre 1 e 120 caracteres.',
                          );
                        const current = generation.current;
                        await gateway.rename(organization.id, parsed.data);
                        await refresh(current);
                        if (current === generation.current)
                          setNotice('Nome atualizado.');
                      });
                    }}
                  >
                    <label>
                      Nome da organização{' '}
                      <input
                        name="name"
                        defaultValue={organization.name}
                        maxLength={120}
                        required
                      />
                    </label>{' '}
                    <button disabled={busy}>Salvar nome</button>
                  </form>
                )}
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
