import { BrandLogo } from '../../../shared/ui/brand/BrandLogo';
import { timezoneName } from '../../../shared/format/dates';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { IdentityGateway } from '../application/identityGateway';
import type { Access } from '../domain/identity';
import { credentials, organizationName } from '../domain/identity';
import type { SignOutReason } from '../application/identityGateway';
import type { ActivityStore } from '../application/sessionActivity';
import { defaultActivityStore } from '../application/sessionActivity';
import { useSessionGuard } from '../application/useSessionGuard';
import { markUnitDraftClean } from '../application/unitDrafts';
import { useUnitDrafts } from '../application/useUnitDrafts';
import { parsePlace, placeSearch } from '../../navigation/domain/areas';
import { EXPIRED_MESSAGE, SIGNED_OUT_MESSAGE, isIdle } from '../domain/session';

type Organization = Access[number];
type OrganizationChanged = (
  message: string,
  kind?: 'notice' | 'error',
  savedForm?: HTMLFormElement | null,
) => Promise<void>;
type RenderOrganizationTools = (
  organization: Organization,
  owner: boolean,
  onChanged: OrganizationChanged,
  busy: boolean,
) => ReactNode;

/** V1: o que a área da unidade precisa saber além do escopo. */
export type UnitContext = {
  active?: boolean;
  unitName: string;
  organizationName: string;
  /** Ferramentas da organização (unidades e nome), mostradas em Cadastros. */
  organizationTools: ReactNode;
};

// The callback is passed as a prop so it is only ever invoked from the tools'
// event handlers, never while IdentityHome renders.
function OrganizationToolsSlot({
  render,
  organization,
  owner,
  onChanged,
  busy,
}: {
  render: RenderOrganizationTools;
  organization: Organization;
  owner: boolean;
  onChanged: OrganizationChanged;
  busy: boolean;
}) {
  return render(organization, owner, onChanged, busy);
}

function OrganizationForm({
  organization,
  busy,
  onRename,
}: {
  organization: Organization;
  busy: boolean;
  onRename: (
    organization: Organization,
    value: unknown,
    form: HTMLFormElement,
  ) => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onRename(
          organization,
          new FormData(event.currentTarget).get('name'),
          event.currentTarget,
        );
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
  );
}

export function IdentityHome({
  gateway,
  renderCatalog,
  renderDestination,
  renderOrganizationTools,
  activity,
  operationalShell = false,
}: {
  gateway: IdentityGateway;
  /** V2: última atividade no navegador; os testes passam uma em memória. */
  activity?: ActivityStore;
  operationalShell?: boolean;
  renderCatalog?: (
    organizationId: string,
    establishmentId: string,
    canCreate: boolean,
    userId: string,
    timezone: string,
    unit: UnitContext,
  ) => ReactNode;
  renderDestination?: (userId: string, access: Access) => ReactNode;
  renderOrganizationTools?: RenderOrganizationTools;
}) {
  const {
    hasDraft: hasUnitDraft,
    hasDraftForScopes,
    clearDrafts,
    clearScopes,
  } = useUnitDrafts();
  const [userId, setUserId] = useState<string | null>(null);
  const [access, setAccess] = useState<Access>([]);
  const [accessEpoch, setAccessEpoch] = useState(0);
  // Empresas que o servidor devolveu com dado inesperado e que não foram carregadas (P7).
  const [skipped, setSkipped] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  // Sair só termina quando o servidor responde; até lá, Entrar fica desativado para que a resposta
  // atrasada do Sair não encerre a sessão de quem entrar logo em seguida no mesmo aparelho.
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // V1: a unidade aberta vem do endereço (?unidade=…), então recarregar e links diretos a mantêm.
  const [catalogUnit, setCatalogUnit] = useState<string | null>(
    () => parsePlace(window.location.search).unit,
  );
  const [visitedUnits, setVisitedUnits] = useState<string[]>(() => {
    const unit = parsePlace(window.location.search).unit;
    return unit ? [unit] : [];
  });
  const generation = useRef(0);
  const [store] = useState(() => activity ?? defaultActivityStore());
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  // Enquanto confere a sessão guardada, não mostra o formulário de entrada.
  const [restoring, setRestoring] = useState(() => !!gateway.currentUser);

  // Troca de usuário no mesmo aparelho: tudo o que era da pessoa anterior sai da tela.
  function clearSession(message: string) {
    generation.current++;
    // Logout and expiration deliberately discard this session's in-memory drafts.
    clearDrafts();
    store.clear();
    setUserId(null);
    setSessionEmail(null);
    setAccess([]);
    setSkipped(0);
    setCatalogUnit(null);
    setVisitedUnits([]);
    // O endereço não guarda a unidade da pessoa que saiu.
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${placeSearch(window.location.search, null, null)}`,
    );
    setPassword('');
    setBusy(false);
    setRestoring(false);
    setNotice('');
    setError(message);
  }
  const clearRef = useRef(clearSession);
  useEffect(() => {
    clearRef.current = clearSession;
  });

  useEffect(
    () =>
      gateway.onSignOut((reason: SignOutReason = 'signed_out') =>
        clearRef.current(
          reason === 'expired' ? EXPIRED_MESSAGE : SIGNED_OUT_MESSAGE,
        ),
      ),
    [gateway],
  );

  useEffect(() => {
    function follow() {
      const next = parsePlace(window.location.search).unit;
      setCatalogUnit(next);
      if (next)
        setVisitedUnits((previous) =>
          previous.includes(next) ? previous : [...previous, next],
        );
    }
    window.addEventListener('popstate', follow);
    return () => window.removeEventListener('popstate', follow);
  }, []);
  function openUnit(id: string) {
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${placeSearch(window.location.search, id, operationalShell ? 'visao-geral' : 'validade')}`,
    );
    setCatalogUnit(id);
    setVisitedUnits((previous) =>
      previous.includes(id) ? previous : [...previous, id],
    );
    if (operationalShell) window.dispatchEvent(new PopStateEvent('popstate'));
  }
  function closeUnit() {
    if (!operationalShell && hasUnitDraft()) {
      if (
        !window.confirm(
          'Há alterações não salvas. Trocar de unidade descartará esses dados. Deseja continuar?',
        )
      )
        return;
      clearDrafts();
    }
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${placeSearch(window.location.search, null, null)}`,
    );
    setCatalogUnit(null);
  }

  async function expireSession() {
    clearSession(EXPIRED_MESSAGE);
    try {
      await (gateway.expire ? gateway.expire() : gateway.signOut());
    } catch (cause) {
      setError(
        `${EXPIRED_MESSAGE} ${cause instanceof Error ? cause.message : ''}`.trim(),
      );
    }
  }
  const expireRef = useRef(expireSession);
  useEffect(() => {
    expireRef.current = expireSession;
  });

  useSessionGuard({
    active: userId !== null,
    store,
    ...(gateway.touch ? { touch: () => gateway.touch!() } : {}),
    expire: () => void expireRef.current(),
  });

  // V2: recarregar a página ou abrir o QR reaproveita a sessão guardada, se ainda valer.
  useEffect(() => {
    if (!gateway.currentUser) return;
    const current = ++generation.current;
    let cancelled = false;
    void (async () => {
      try {
        const user = await gateway.currentUser!();
        if (cancelled || current !== generation.current) return;
        if (!user) {
          setRestoring(false);
          return;
        }
        if (isIdle(store.read(), Date.now())) {
          await expireRef.current();
          return;
        }
        const state = gateway.touch ? await gateway.touch() : 'ok';
        if (cancelled || current !== generation.current) return;
        if (state === 'expired') {
          await expireRef.current();
          return;
        }
        store.write(Date.now());
        setUserId(user.id);
        setSessionEmail(user.email);
        setRestoring(false);
        setBusy(true);
        try {
          await refresh(current);
        } finally {
          if (current === generation.current) setBusy(false);
        }
      } catch (cause) {
        if (cancelled || current !== generation.current) return;
        setRestoring(false);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível confirmar a sessão. Tente novamente.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // Só ao abrir a tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway]);

  async function run(action: () => Promise<void>) {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (cause) {
      if (current === generation.current) {
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
  async function refresh(current: number): Promise<boolean> {
    const report = gateway.loadReport
      ? await gateway.loadReport()
      : { access: await gateway.load(), skipped: 0 };
    if (current !== generation.current) return false;
    const rows = report.access;
    const previousUnitIds = new Set(
      access.flatMap((organization) =>
        organization.establishments.map((unit) => unit.id),
      ),
    );
    const nextUnitIds = new Set(
      rows.flatMap((organization) =>
        organization.establishments.map((unit) => unit.id),
      ),
    );
    const revokedUnitIds = new Set(
      Array.from(previousUnitIds).filter((id) => !nextUnitIds.has(id)),
    );
    if (rows.length === 0) {
      clearDrafts();
      setAccess([]);
      setSkipped(report.skipped);
      setAccessEpoch((epoch) => epoch + 1);
      throw new Error(
        report.skipped > 0
          ? 'Não foi possível carregar sua empresa. Atualize o acesso ou avise o responsável.'
          : 'Nenhum vínculo ativo. Solicite acesso ao responsável.',
      );
    }
    if (revokedUnitIds.size > 0) {
      const retainedDrafts = hasDraftForScopes(nextUnitIds);
      const discardRetained = retainedDrafts
        ? window.confirm(
            'Seu acesso a uma unidade mudou. Atualizar a lista descartará os rascunhos das unidades ainda disponíveis. Deseja continuar?',
          )
        : false;
      if (current !== generation.current) return false;
      clearScopes(revokedUnitIds);
      setAccess(rows);
      setSkipped(report.skipped);
      if (discardRetained) {
        clearDrafts();
        setAccessEpoch((epoch) => epoch + 1);
        return true;
      }
      return true;
    }
    const discardDrafts = hasUnitDraft();
    if (
      discardDrafts &&
      !window.confirm(
        'Há alterações não salvas. Atualizar o acesso descartará esses dados. Deseja continuar?',
      )
    )
      return false;
    if (current !== generation.current) return false;
    if (discardDrafts) clearDrafts();
    setAccessEpoch((epoch) => epoch + 1);
    setAccess(rows);
    setSkipped(report.skipped);
    return true;
  }
  function changed(
    message: string,
    kind: 'notice' | 'error' = 'notice',
    savedForm?: HTMLFormElement | null,
  ) {
    return run(async () => {
      const current = generation.current;
      if (kind === 'notice') markUnitDraftClean(savedForm);
      try {
        const refreshed = await refresh(current);
        if (current !== generation.current) return;
        if (!refreshed) {
          if (kind === 'error') setError(message);
          else
            setNotice(
              `${message} A lista não foi atualizada porque há alterações em outros formulários. Atualize o acesso depois de salvá-las ou revisá-las.`,
            );
          return;
        }
      } catch (cause) {
        // Keep the outcome of the write visible even if reloading fails,
        // so a confirmed creation is not mistaken for a failure and retried.
        throw new Error(
          `${message} Não foi possível atualizar a lista: ${
            cause instanceof Error ? cause.message : 'tente novamente.'
          }`,
          { cause },
        );
      }
      if (current !== generation.current) return;
      if (kind === 'error') setError(message);
      else setNotice(message);
    });
  }
  function signIn(event: FormEvent) {
    event.preventDefault();
    if (signingOut) return;
    void run(async () => {
      const input = credentials.safeParse({ email, password });
      if (!input.success) throw new Error('Informe e-mail válido e senha.');
      const current = generation.current;
      const id = await gateway.signIn(input.data.email, input.data.password);
      if (current !== generation.current) return;
      store.write(Date.now());
      setUserId(id);
      setSessionEmail(input.data.email);
      setPassword('');
      await refresh(current);
    });
  }

  function renameOrganization(
    organization: Organization,
    value: unknown,
    form: HTMLFormElement,
  ) {
    const parsed = organizationName.safeParse(value);
    if (!parsed.success) {
      // Local validation never reached the server: keep access visible.
      setNotice('');
      setError('Informe nome entre 1 e 120 caracteres.');
      return;
    }
    void run(async () => {
      const current = generation.current;
      await gateway.rename(organization.id, parsed.data);
      markUnitDraftClean(form);
      const refreshed = await refresh(current);
      if (current === generation.current)
        setNotice(
          refreshed
            ? 'Nome atualizado.'
            : 'Nome atualizado. A lista não foi atualizada porque há alterações em outros formulários. Atualize o acesso depois de salvá-las ou revisá-las.',
        );
    });
  }
  const refreshButton = (
    <button
      type="button"
      className="secondary"
      disabled={busy}
      onClick={() =>
        void run(async () => {
          await refresh(generation.current);
        })
      }
    >
      Atualizar acesso
    </button>
  );
  // V1: unidade aberta (se o usuário tem acesso a ela).
  const targets = userId
    ? access.flatMap((organization) =>
        organization.establishments.map((unit) => ({
          organization,
          unit,
          owner: organization.memberships.some(
            (m) => m.user_id === userId && m.role === 'owner',
          ),
        })),
      )
    : [];
  const openTarget = targets.find((target) => target.unit.id === catalogUnit);
  const showShell = operationalShell && !!userId;
  const pageClass = showShell
    ? `mesa-workspace ${openTarget ? 'unit-open' : 'mesa-selection'}`
    : openTarget
      ? 'unit-open'
      : userId
        ? ''
        : 'sign-in';

  return (
    <main className={`workspace ${pageClass}`}>
      {openTarget && (
        <a className="skip-link" href="#conteudo-unidade">
          Pular para o conteúdo
        </a>
      )}
      {!userId && <BrandLogo className="sign-in-brand" alt="" />}
      {showShell && !openTarget && (
        <aside
          className="mesa-sidebar mesa-selection-side"
          aria-label="CozziGo"
        >
          <div className="mesa-nav-brand">
            <BrandLogo />
          </div>
        </aside>
      )}
      <h1 className={userId ? undefined : 'visually-hidden'}>
        CozziGo — unidades, recebimentos e validade
      </h1>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {skipped > 0 && (
        <p role="note">
          Não foi possível carregar {skipped}{' '}
          {skipped === 1 ? 'empresa' : 'empresas'}. As demais aparecem
          normalmente; atualize o acesso ou avise o responsável.
        </p>
      )}
      {userId && (
        <section
          aria-label="Sessão"
          className={showShell ? 'session-bar mesa-topbar' : 'session-bar'}
        >
          {showShell && (
            <div className="mesa-unit-select">
              <BrandLogo
                variant="mark"
                className="unit-brand-mark"
                alt=""
                size={32}
              />
              <label>
                <span className="visually-hidden">Unidade</span>
                <select
                  value={catalogUnit ?? ''}
                  onChange={(event) =>
                    event.target.value
                      ? openUnit(event.target.value)
                      : closeUnit()
                  }
                >
                  <option value="">Todas as unidades</option>
                  {targets.map((target) => (
                    <option key={target.unit.id} value={target.unit.id}>
                      {target.unit.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {showShell && (
            <details className="mesa-account">
              <summary>Minha conta</summary>
              <div>
                <strong>{sessionEmail}</strong>
                {openTarget && (
                  <p>{openTarget.owner ? 'Proprietário' : 'Colaborador'}</p>
                )}
                {refreshButton}
                <p>A sessão encerra após 30 minutos sem uso.</p>
              </div>
            </details>
          )}
          {/* Na Mesa, unidade e e-mail ficam no seletor e em "Minha conta"; não repetir oculto. */}
          {!showShell && (
            <p className="session-who">
              {openTarget ? (
                <>
                  Unidade: <strong>{openTarget.unit.name}</strong>.{' '}
                </>
              ) : null}
              {sessionEmail ? (
                <>
                  Conectado como <strong>{sessionEmail}</strong>.
                </>
              ) : null}
            </p>
          )}
          <button
            className="secondary"
            type="button"
            onClick={() =>
              void (async () => {
                setSigningOut(true);
                clearSession('');
                try {
                  await gateway.signOut();
                  // O aviso de "sessão encerrada" do evento não vale para quem tocou em Sair.
                  setError('');
                  setNotice('Você saiu da conta.');
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Não foi possível encerrar a sessão no servidor.',
                  );
                } finally {
                  setSigningOut(false);
                }
              })()
            }
          >
            Sair
          </button>
          <details className="session-note">
            <summary>Sobre a sessão</summary>
            <p>
              Sem uso por 30 minutos, a sessão é encerrada. Aparelho
              compartilhado: cada pessoa entra com a própria conta.
            </p>
          </details>
        </section>
      )}
      {restoring && !userId ? (
        <p role="status">Conferindo a sessão…</p>
      ) : !userId ? (
        <form
          className="sign-in-form"
          aria-labelledby="sign-in-title"
          onSubmit={signIn}
        >
          <h2 id="sign-in-title">Entre na sua conta</h2>
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
          <button disabled={busy || signingOut}>Entrar</button>
        </form>
      ) : (
        <>
          {!busy && access.length > 0 && (
            <Fragment key={accessEpoch}>
              {renderDestination?.(userId, access)}
            </Fragment>
          )}
          {!openTarget && !showShell && refreshButton}
          {showShell && !openTarget && targets.length > 0 && (
            <header className="mesa-page-heading mesa-selection-heading">
              <h2>Unidades</h2>
              <p>Selecione a unidade que deseja acompanhar.</p>
            </header>
          )}
          {openTarget && renderCatalog ? (
            <section
              key={accessEpoch}
              aria-label={`Unidade ${openTarget.unit.name}`}
              className="unit-shell"
              data-unit-draft-scope={openTarget.unit.id}
            >
              {!showShell && (
                <header className="unit-header">
                  <div className="unit-title">
                    <p>
                      {openTarget.organization.name} · Papel:{' '}
                      {openTarget.owner ? 'Proprietário' : 'Colaborador'}
                    </p>
                    <h2>
                      <BrandLogo
                        variant="mark"
                        className="unit-brand-mark"
                        alt=""
                        size={32}
                      />
                      {openTarget.unit.name}
                    </h2>
                  </div>
                  <div className="unit-actions">
                    {refreshButton}
                    <button
                      type="button"
                      className="secondary"
                      onClick={closeUnit}
                    >
                      Trocar de unidade
                    </button>
                  </div>
                </header>
              )}
              {!operationalShell &&
                renderCatalog(
                  openTarget.organization.id,
                  openTarget.unit.id,
                  openTarget.owner,
                  userId,
                  openTarget.unit.timezone,
                  {
                    unitName: openTarget.unit.name,
                    organizationName: openTarget.organization.name,
                    organizationTools: (
                      <>
                        {renderOrganizationTools && (
                          <OrganizationToolsSlot
                            render={renderOrganizationTools}
                            organization={openTarget.organization}
                            owner={openTarget.owner}
                            onChanged={changed}
                            busy={busy}
                          />
                        )}
                        {openTarget.owner && (
                          <OrganizationForm
                            organization={openTarget.organization}
                            busy={busy}
                            onRename={renameOrganization}
                          />
                        )}
                      </>
                    ),
                  },
                )}
            </section>
          ) : (
            access.map((organization) => {
              const owner = organization.memberships.some(
                (m) => m.user_id === userId && m.role === 'owner',
              );
              // D-075: no início da Mesa só aparecem as unidades. Nome da organização e gestão de
              // unidades ficam em Configurações > Organização (ou aqui, enquanto não houver unidade).
              if (operationalShell)
                return (
                  <section
                    key={organization.id}
                    className="mesa-panel mesa-organization-card"
                    aria-labelledby={`organizacao-${organization.id}`}
                  >
                    <header className="mesa-organization-head">
                      <h2 id={`organizacao-${organization.id}`}>
                        {organization.name}
                      </h2>
                      <p className="mesa-role">
                        Papel: {owner ? 'Proprietário' : 'Colaborador'}
                      </p>
                    </header>
                    {organization.establishments.length > 0 ? (
                      <ul
                        className="mesa-unit-cards"
                        aria-label={`Unidades de ${organization.name}`}
                      >
                        {organization.establishments.map((unit) => (
                          <li key={unit.id}>
                            <div>
                              <strong>{unit.name}</strong>
                              <span>{timezoneName(unit.timezone)}</span>
                            </div>
                            {renderCatalog && (
                              <button
                                type="button"
                                className="secondary"
                                aria-label={`Abrir ${unit.name}`}
                                onClick={() => openUnit(unit.id)}
                              >
                                Abrir
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <>
                        <p>Nenhuma unidade cadastrada.</p>
                        {renderOrganizationTools && (
                          <OrganizationToolsSlot
                            render={renderOrganizationTools}
                            organization={organization}
                            owner={owner}
                            onChanged={changed}
                            busy={busy}
                          />
                        )}
                      </>
                    )}
                  </section>
                );
              return (
                <section
                  key={organization.id}
                  className={
                    operationalShell
                      ? 'mesa-panel mesa-organization-card'
                      : undefined
                  }
                >
                  <h2>{organization.name}</h2>
                  <p>Papel: {owner ? 'Proprietário' : 'Colaborador'}</p>
                  <ul>
                    {organization.establishments.map((unit) => (
                      <li key={unit.id}>
                        {unit.name} — {unit.timezone}
                        {renderCatalog && (
                          <>
                            {' '}
                            {/* V4 (D3): o nome da unidade está ao lado; continua no nome acessível. */}
                            <button
                              className="secondary"
                              aria-label={`Abrir ${unit.name}`}
                              onClick={() => openUnit(unit.id)}
                            >
                              Abrir
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {renderOrganizationTools && (
                    <OrganizationToolsSlot
                      render={renderOrganizationTools}
                      organization={organization}
                      owner={owner}
                      onChanged={changed}
                      busy={busy}
                    />
                  )}
                  {organization.establishments.length === 0 && (
                    <p>Nenhuma unidade cadastrada.</p>
                  )}
                  {owner && (
                    <OrganizationForm
                      organization={organization}
                      busy={busy}
                      onRename={renameOrganization}
                    />
                  )}
                </section>
              );
            })
          )}
          {operationalShell &&
            renderCatalog &&
            targets
              .filter((target) => visitedUnits.includes(target.unit.id))
              .map((target) => {
                const active = target.unit.id === catalogUnit;
                return (
                  <div
                    data-unit-draft-scope={target.unit.id}
                    key={`${accessEpoch}:${userId}:${target.organization.id}:${target.unit.id}`}
                    hidden={!active}
                  >
                    {renderCatalog(
                      target.organization.id,
                      target.unit.id,
                      target.owner,
                      userId,
                      target.unit.timezone,
                      {
                        active,
                        unitName: target.unit.name,
                        organizationName: target.organization.name,
                        organizationTools: target.owner && (
                          <section
                            className="mesa-organization-settings"
                            aria-label="Organização"
                          >
                            <header className="mesa-page-heading">
                              <h2>Organização</h2>
                              <p>
                                Nome da organização e unidades de{' '}
                                {target.organization.name}.
                              </p>
                            </header>
                            <section className="mesa-panel mesa-settings-block">
                              <h3>Dados da organização</h3>
                              <OrganizationForm
                                organization={target.organization}
                                busy={busy}
                                onRename={renameOrganization}
                              />
                            </section>
                            {renderOrganizationTools && (
                              <section className="mesa-panel mesa-settings-block">
                                <h3>Unidades</h3>
                                <p className="hint">
                                  Renomeie as unidades ou cadastre uma nova.
                                </p>
                                <OrganizationToolsSlot
                                  render={renderOrganizationTools}
                                  organization={target.organization}
                                  owner
                                  busy={busy}
                                  onChanged={changed}
                                />
                              </section>
                            )}
                          </section>
                        ),
                      },
                    )}
                  </div>
                );
              })}
        </>
      )}
    </main>
  );
}
