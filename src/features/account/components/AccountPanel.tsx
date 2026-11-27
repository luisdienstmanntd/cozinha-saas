import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import QRCode from 'qrcode';
import type { AccountGateway } from '../application/accountGateway';
import {
  MIN_PASSWORD,
  newPassword,
  parseMfaCode,
  type MfaEnrollment,
  type MfaFactor,
} from '../domain/account';

const CODE_ERROR = 'Informe o código de 6 dígitos mostrado no aplicativo.';

function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export function AccountPanel({
  gateway,
  email,
}: {
  gateway: AccountGateway;
  email?: string | null;
}) {
  const [factors, setFactors] = useState<MfaFactor[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [qr, setQr] = useState<{ for: string; url: string } | null>(null);
  const [code, setCode] = useState('');
  const [removing, setRemoving] = useState(false);

  const [reload, setReload] = useState(0);
  const loadFactors = useCallback(() => setReload((value) => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    gateway
      .factors()
      .then((list) => {
        if (cancelled) return;
        setFactors(list);
        setLoadError('');
      })
      .catch((cause) => {
        if (!cancelled)
          setLoadError(message(cause, 'Não foi possível consultar a conta.'));
      });
    return () => {
      cancelled = true;
    };
  }, [gateway, reload]);

  // O QR só vale para o cadastro a que pertence (`for`); trocar o cadastro esconde o anterior.
  useEffect(() => {
    if (!enrollment) return;
    let cancelled = false;
    QRCode.toDataURL(enrollment.uri, { margin: 1, width: 192 })
      .then((url) => {
        if (!cancelled) setQr({ for: enrollment.uri, url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enrollment]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await work();
    } catch (cause) {
      setError(message(cause, 'Não foi possível concluir. Tente novamente.'));
    } finally {
      setBusy(false);
    }
  }

  function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError('');
    const parsed = newPassword.safeParse({ password, confirm });
    if (!parsed.success) {
      setNotice('');
      setPasswordError(parsed.error.issues[0]?.message ?? 'Senha inválida.');
      return;
    }
    void run(async () => {
      await gateway.changePassword(password);
      setPassword('');
      setConfirm('');
      setNotice('Senha trocada. Use a nova senha na próxima entrada.');
    });
  }

  function startEnroll() {
    void run(async () => {
      setEnrollment(await gateway.startEnroll());
      setCode('');
    });
  }

  function cancelEnroll() {
    const pending = enrollment;
    setEnrollment(null);
    setCode('');
    if (pending) void gateway.cancelEnroll(pending.factorId).catch(() => {});
  }

  function confirmEnroll(event: FormEvent) {
    event.preventDefault();
    const digits = parseMfaCode(code);
    if (!digits || !enrollment) {
      setNotice('');
      setError(CODE_ERROR);
      return;
    }
    void run(async () => {
      await gateway.confirmEnroll(enrollment.factorId, digits);
      setEnrollment(null);
      setCode('');
      setNotice(
        'Verificação em duas etapas ativada. Nas próximas entradas será pedido o código do aplicativo.',
      );
      loadFactors();
    });
  }

  function removeFactor(event: FormEvent, factor: MfaFactor) {
    event.preventDefault();
    const digits = parseMfaCode(code);
    if (!digits) {
      setNotice('');
      setError(CODE_ERROR);
      return;
    }
    void run(async () => {
      await gateway.removeFactor(factor.id, digits);
      setRemoving(false);
      setCode('');
      setNotice('Verificação em duas etapas removida.');
      loadFactors();
    });
  }

  const active = factors && factors.length > 0 ? factors[0] : null;

  return (
    <section className="account-panel" aria-labelledby="account-title">
      <header className="mesa-page-heading">
        <h2 id="account-title">Senha e acesso</h2>
        <p>
          {email ? `${email}. ` : ''}Troque a senha e proteja a entrada com um
          aplicativo autenticador.
        </p>
      </header>
      <div role="status" aria-live="polite">
        {notice && <p className="notice">{notice}</p>}
      </div>
      <div role="alert">{error && <p className="error">{error}</p>}</div>

      <section className="panel mesa-settings-block" aria-label="Senha">
        <h3>Trocar senha</h3>
        <p className="hint">
          Mínimo de {MIN_PASSWORD} caracteres. A sessão atual continua aberta; a
          regra de 30 minutos sem uso não muda.
        </p>
        <form onSubmit={changePassword} noValidate>
          <label>
            Nova senha
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={passwordError ? true : undefined}
            />
          </label>
          <label>
            Repita a nova senha
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={passwordError ? true : undefined}
            />
          </label>
          <button disabled={busy}>Trocar senha</button>
        </form>
        {passwordError && (
          <p className="error" role="alert">
            {passwordError}
          </p>
        )}
      </section>

      <section
        className="panel mesa-settings-block"
        aria-label="Verificação em duas etapas"
      >
        <h3>Verificação em duas etapas</h3>
        {loadError ? (
          <p className="error" role="alert">
            {loadError}{' '}
            <button type="button" onClick={loadFactors}>
              Tentar de novo
            </button>
          </p>
        ) : factors === null ? (
          <p role="status">Consultando…</p>
        ) : enrollment ? (
          <>
            <p className="hint">
              1. Abra um aplicativo autenticador no celular e escaneie o QR (ou
              digite a chave). 2. Digite o código de 6 dígitos que ele mostrar.
            </p>
            {enrollment && qr?.for === enrollment.uri && (
              <img
                className="account-qr"
                src={qr.url}
                alt="QR para cadastrar o aplicativo autenticador"
                width={192}
                height={192}
              />
            )}
            <p>
              Chave: <code className="account-secret">{enrollment.secret}</code>
            </p>
            <form onSubmit={confirmEnroll} noValidate>
              <label>
                Código do aplicativo
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button disabled={busy}>Ativar</button>
              <button type="button" onClick={cancelEnroll} disabled={busy}>
                Cancelar
              </button>
            </form>
          </>
        ) : active ? (
          <>
            <p>
              <strong>Ativada.</strong> A entrada pede a senha e o código do
              aplicativo.
            </p>
            {removing ? (
              <form
                onSubmit={(event) => removeFactor(event, active)}
                noValidate
              >
                <label>
                  Código atual do aplicativo
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={7}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Remover verificação</button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRemoving(false);
                    setCode('');
                  }}
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRemoving(true);
                  setCode('');
                }}
              >
                Remover verificação em duas etapas
              </button>
            )}
          </>
        ) : (
          <>
            <p className="hint">
              Ainda não ativada. Com ela, quem souber a senha também precisa do
              código do seu aplicativo para entrar.
            </p>
            <button type="button" onClick={startEnroll} disabled={busy}>
              Ativar verificação em duas etapas
            </button>
          </>
        )}
      </section>
    </section>
  );
}
