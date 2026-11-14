import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { SettingsGateway } from '../application/settingsGateway';
import { SettingsRejected } from '../application/settingsGateway';
import type {
  EstablishmentSettings,
  PortionRule,
  Registrar,
} from '../domain/settings';
import {
  MAX_MINUTES,
  MIN_MINUTES,
  durationText,
  portionRuleLabels,
  portionRules,
  registrarLabels,
  registrars,
} from '../domain/settings';

export const MEMBER_MODE_TEXT =
  'Cada colaborador registra só a própria produção, com a validade. Decidir ocorrência, anular, porcionar e as demais operações continuam só do proprietário.';
export const UNLABELED_TEXT =
  'Guardado para o aviso de produção sem etiqueta, que ainda não está disponível.';
const LOAD_ERROR =
  'Não foi possível carregar as configurações da unidade. Tente novamente.';

type Props = {
  scope: CatalogScope;
  gateway: SettingsGateway;
  canEdit: boolean;
  // Algo foi salvo: a produção e o porcionamento leem a configuração de novo.
  onSaved?: () => void;
};
type Stage = 'view' | 'form' | 'review';
type Change = { label: string; before: string; after: string };

function describe(settings: EstablishmentSettings) {
  return {
    registrar: registrarLabels[settings.production_registrar],
    window: durationText(settings.production_window_minutes),
    unlabeled: durationText(settings.unlabeled_limit_minutes),
    portion: portionRuleLabels[settings.portion_expiry_rule],
  };
}

function changes(
  before: EstablishmentSettings,
  after: EstablishmentSettings,
): Change[] {
  const a = describe(before);
  const b = describe(after);
  const rows: Change[] = [
    {
      label: 'Quem registra produção',
      before: a.registrar,
      after: b.registrar,
    },
    {
      label: 'Janela de registro da produção',
      before: a.window,
      after: b.window,
    },
    {
      label: 'Tempo máximo sem etiqueta',
      before: a.unlabeled,
      after: b.unlabeled,
    },
    {
      label: 'Porção de preparação própria',
      before: a.portion,
      after: b.portion,
    },
  ];
  return rows.filter((row) => row.before !== row.after);
}

function minutesOf(value: string): number | null {
  if (!/^\d{1,4}$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return parsed >= MIN_MINUTES && parsed <= MAX_MINUTES ? parsed : null;
}

// Fatia 7.6: configurações por unidade. Todos leem; só o proprietário muda, em passos (formulário,
// revisão, confirmação). Cada troca fica auditada no banco e vale para os registros novos.
function SettingsContents({ scope, gateway, canEdit, onSaved }: Props) {
  const [current, setCurrent] = useState<EstablishmentSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<Stage>('view');
  const [registrar, setRegistrar] = useState<Registrar>('owner');
  const [windowMinutes, setWindowMinutes] = useState('');
  const [unlabeled, setUnlabeled] = useState('');
  const [portion, setPortion] = useState<PortionRule>('equal');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const { organizationId, establishmentId } = scope;

  useEffect(() => {
    let active = true;
    void gateway.get({ organizationId, establishmentId }).then(
      (loaded) => {
        if (active) setCurrent(loaded);
      },
      () => {
        if (active) setLoadError(LOAD_ERROR);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, gateway, organizationId, establishmentId]);

  if (loadError)
    return (
      <section aria-label="Configurações da unidade">
        <h3>Configurações da unidade</h3>
        <p role="alert">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoadError('');
            setAttempt((value) => value + 1);
          }}
        >
          Tentar novamente
        </button>
      </section>
    );
  if (!current)
    return (
      <section aria-label="Configurações da unidade">
        <h3>Configurações da unidade</h3>
        <p>Carregando configurações…</p>
      </section>
    );

  const shown = describe(current);
  const window = minutesOf(windowMinutes);
  const limit = minutesOf(unlabeled);
  const next: EstablishmentSettings | null =
    window !== null && limit !== null
      ? {
          production_registrar: registrar,
          production_window_minutes: window,
          unlabeled_limit_minutes: limit,
          portion_expiry_rule: portion,
        }
      : null;
  const pending = next ? changes(current, next) : [];

  function open() {
    if (!current) return;
    setRegistrar(current.production_registrar);
    setWindowMinutes(String(current.production_window_minutes));
    setUnlabeled(String(current.unlabeled_limit_minutes));
    setPortion(current.portion_expiry_rule);
    setError('');
    setNotice('');
    setStage('form');
  }
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (window === null)
      return setError(
        'A janela de registro da produção deve ficar entre 15 minutos e 24 horas, em minutos inteiros.',
      );
    if (limit === null)
      return setError(
        'O tempo máximo sem etiqueta deve ficar entre 15 minutos e 24 horas, em minutos inteiros.',
      );
    if (pending.length === 0)
      return setError('Nenhuma configuração foi alterada.');
    setStage('review');
  }
  async function confirm() {
    if (!next || busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await gateway.save(
        { organizationId, establishmentId },
        next,
      );
      setCurrent(saved);
      setStage('view');
      setNotice(
        'Configurações salvas. Valem para os registros novos; os registros anteriores não mudam.',
      );
      onSaved?.();
    } catch (cause) {
      if (cause instanceof SettingsRejected) {
        setError(cause.message);
        setStage('form');
      } else {
        // Resultado incerto: relê o que está gravado antes de qualquer nova tentativa.
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível salvar.',
        );
        setStage('view');
        setCurrent(null);
        setAttempt((value) => value + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Configurações da unidade">
      <h3>Configurações da unidade</h3>
      <ul aria-label="Configurações em vigor">
        <li>Quem registra produção: {shown.registrar}</li>
        <li>
          Janela de registro da produção: {shown.window}. Acima dela, o registro
          exige justificativa e o lote fica bloqueado até a decisão do
          proprietário.
        </li>
        <li>
          Tempo máximo sem etiqueta: {shown.unlabeled}. {UNLABELED_TEXT}
        </li>
        <li>Porção de preparação própria: {shown.portion}</li>
      </ul>
      {current.production_registrar === 'member' && <p>{MEMBER_MODE_TEXT}</p>}
      {notice && <p role="status">{notice}</p>}
      {stage === 'view' && error && <p role="alert">{error}</p>}
      {!canEdit && (
        <p>Somente o proprietário muda as configurações da unidade.</p>
      )}
      {canEdit && stage === 'view' && (
        <button type="button" onClick={open}>
          Alterar configurações
        </button>
      )}
      {canEdit && stage === 'form' && (
        <form aria-label="Alterar configurações" onSubmit={review}>
          <fieldset disabled={busy}>
            <legend>Quem registra produção</legend>
            {registrars.map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="registrar"
                  checked={registrar === value}
                  onChange={() => setRegistrar(value)}
                />{' '}
                {registrarLabels[value]}{' '}
              </label>
            ))}
          </fieldset>
          <p>
            <label>
              Janela de registro da produção (minutos){' '}
              <input
                inputMode="numeric"
                value={windowMinutes}
                onChange={(event) => setWindowMinutes(event.target.value)}
              />
            </label>{' '}
            {window !== null && `(${durationText(window)}) `}Entre 15 minutos e
            24 horas.
          </p>
          <p>
            <label>
              Tempo máximo sem etiqueta (minutos){' '}
              <input
                inputMode="numeric"
                value={unlabeled}
                onChange={(event) => setUnlabeled(event.target.value)}
              />
            </label>{' '}
            {limit !== null && `(${durationText(limit)}) `}Entre 15 minutos e 24
            horas.
          </p>
          <fieldset disabled={busy}>
            <legend>Porção de preparação própria</legend>
            {portionRules.map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="portion"
                  checked={portion === value}
                  onChange={() => setPortion(value)}
                />{' '}
                {portionRuleLabels[value]}{' '}
              </label>
            ))}
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <button type="submit">Revisar configurações</button>{' '}
          <button
            type="button"
            onClick={() => {
              setStage('view');
              setError('');
            }}
          >
            Cancelar
          </button>
        </form>
      )}
      {canEdit && stage === 'review' && (
        <section aria-label="Revisão das configurações">
          <h4>Revise antes de confirmar</h4>
          <ul>
            {pending.map((row) => (
              <li key={row.label}>
                {row.label}: {row.before} → {row.after}
              </li>
            ))}
          </ul>
          {next?.production_registrar === 'member' &&
            current.production_registrar !== 'member' && (
              <p>{MEMBER_MODE_TEXT}</p>
            )}
          <p>
            A mudança vale para os registros novos e fica registrada com quem
            mudou e o horário.
          </p>
          {error && <p role="alert">{error}</p>}
          <button type="button" disabled={busy} onClick={() => void confirm()}>
            Confirmar configurações
          </button>{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => setStage('form')}
          >
            Voltar e corrigir
          </button>
        </section>
      )}
    </section>
  );
}

export function SettingsPanel(props: Props) {
  return (
    <SettingsContents
      key={`${props.scope.organizationId}:${props.scope.establishmentId}`}
      {...props}
    />
  );
}
