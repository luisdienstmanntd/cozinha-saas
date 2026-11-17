import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogGateway } from '../../catalog/application/catalogGateway';
import type { CatalogItem, CatalogScope } from '../../catalog/domain/catalog';
import { storageLabels } from '../../catalog/domain/catalog';
import type { Member } from '../../handling/domain/family';
import {
  formatDate,
  instantToZoned,
  isQuantity,
  zonedToInstant,
} from '../../handling/domain/handling';
import type { ProductionGateway } from '../application/productionGateway';
import { ProductionRejected } from '../application/productionGateway';
import type { ProductionRow } from '../domain/production';
import {
  daysBetween,
  expiryInWords,
  localDateOf,
  productionInputSchema,
  productionLateText,
} from '../domain/production';
import { VoidProduction } from './VoidProduction';
import type { LabelGateway } from '../../labels/application/labelGateway';
import { DownloadLabels } from '../../labels/components/DownloadLabels';
import type { SettingsGateway } from '../../settings/application/settingsGateway';
import type { EstablishmentSettings } from '../../settings/domain/settings';
import { DEFAULT_SETTINGS, durationText } from '../../settings/domain/settings';

export const PRODUCTION_EXPIRY_TEXT =
  'Informe a validade definida pelo responsável. O sistema não calcula nem sugere prazos.';
export const PRODUCTION_LATE_TEXT =
  'Registro mais de 2 horas depois da produção. O lote ficará bloqueado até a decisão do proprietário.';
export const OWN_NAME_TEXT =
  'Peça ao proprietário para definir o seu nome de exibição antes de registrar a produção.';
export const SAME_DAY_TEXT =
  'A validade é no mesmo dia da produção. Confirmo que é isso mesmo.';
const LOAD_ERROR =
  'Não foi possível carregar as produções. Confira o acesso e tente novamente.';
const INTENT_ERROR =
  'Não foi possível confirmar o registro. Repita a mesma tentativa; não crie outra sem conferir as produções.';
// 'closed': só o botão "Registrar produção"; o formulário abre por escolha da pessoa.
type Stage = 'closed' | 'form' | 'review' | 'done';

function when(iso: string, zone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: zone,
  }).format(new Date(iso));
}

type Props = {
  scope: CatalogScope;
  timezone: string;
  userId: string;
  canCreate: boolean;
  catalog: CatalogGateway;
  gateway: ProductionGateway;
  loadMembers: (scope: CatalogScope) => Promise<Member[]>;
  setDisplayName: (
    scope: CatalogScope,
    userId: string,
    name: string,
  ) => Promise<string>;
  catalogRevision?: number;
  reloadToken?: number;
  now?: () => Date;
  // Fatia 7.4: etiqueta "Preparação própria" do recipiente integral.
  labels?: LabelGateway;
  // Algo foi gravado: a lista de recipientes relê o saldo.
  onChanged?: () => void;
  // Fatia 7.6: quem registra e a janela vêm da configuração da unidade.
  settings?: SettingsGateway;
  settingsRevision?: number;
};

// Fatia 7.3 (desenho 5.1, D-043): produção da cozinha em passos (formulário, revisão, confirmação e
// resultado) e lista das produções recentes com "Anular produção". Só o proprietário escreve (D-019),
// exceto no modo da 7.6 em que cada colaborador registra a própria produção; anular segue do proprietário.
function ProductionContents({
  scope,
  timezone,
  userId,
  canCreate,
  catalog,
  gateway,
  loadMembers,
  setDisplayName,
  catalogRevision,
  reloadToken,
  now = () => new Date(),
  labels,
  onChanged,
  settings,
  settingsRevision,
}: Props) {
  const [preparations, setPreparations] = useState<CatalogItem[] | null>(null);
  const [rows, setRows] = useState<ProductionRow[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [rules, setRules] = useState<EstablishmentSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<Stage>('closed');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [producedAt, setProducedAt] = useState('');
  // Sem edição, vale o instante exato do registro (como na manipulação, 6.6).
  const [producedTouched, setProducedTouched] = useState(false);
  const [expiry, setExpiry] = useState('');
  const [handledBy, setHandledBy] = useState('');
  const [note, setNote] = useState('');
  const [lateReason, setLateReason] = useState('');
  const [sameDay, setSameDay] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [result, setResult] = useState<{
    batchId: string;
    late: boolean;
  } | null>(null);
  const intent = useRef<string | null>(null);
  const key = `production-intent:${userId}:${scope.organizationId}:${scope.establishmentId}`;
  const { organizationId, establishmentId } = scope;

  useEffect(() => {
    let current = true;
    const target = { organizationId, establishmentId };
    void (settings ? settings.get(target) : Promise.resolve(DEFAULT_SETTINGS))
      .then((loaded) =>
        Promise.all([
          catalog.list('preparations', target),
          gateway.list(target),
          canCreate || loaded.production_registrar === 'member'
            ? loadMembers(target)
            : Promise.resolve([]),
          loaded,
        ]),
      )
      .then(
        ([items, listed, people, loaded]) => {
          if (!current) return;
          setPreparations(items);
          setRows(listed);
          setRules(loaded);
          // Quem não é proprietário registra só a própria produção.
          setMembers(
            canCreate ? people : people.filter((p) => p.user_id === userId),
          );
          setLoadError('');
          setHandledBy((previous) => {
            if (previous) return previous;
            const self = people.find((person) => person.user_id === userId);
            return self?.display_name ? userId : '';
          });
        },
        () => {
          if (current) setLoadError(LOAD_ERROR);
        },
      );
    return () => {
      current = false;
    };
  }, [
    attempt,
    catalog,
    gateway,
    loadMembers,
    canCreate,
    organizationId,
    establishmentId,
    userId,
    catalogRevision,
    reloadToken,
    settings,
    settingsRevision,
  ]);

  function reloadList() {
    void gateway
      .list({ organizationId, establishmentId })
      .then(setRows, () => setLoadError(LOAD_ERROR));
  }
  function resetIntent() {
    intent.current = null;
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* sem sessionStorage: a tentativa só vale nesta tela */
    }
  }
  function ensureIntent() {
    try {
      intent.current ??= sessionStorage.getItem(key) ?? crypto.randomUUID();
      sessionStorage.setItem(key, intent.current);
    } catch {
      intent.current ??= crypto.randomUUID();
    }
    return intent.current;
  }
  function startForm() {
    setStage('form');
    setResult(null);
    setProductId('');
    setQuantity('');
    setProducedTouched(false);
    setProducedAt(instantToZoned(now(), timezone));
    setExpiry('');
    setNote('');
    setLateReason('');
    setSameDay(false);
    setError('');
  }

  if (loadError)
    return (
      <section aria-label="Produção da cozinha">
        <h3>Produção da cozinha</h3>
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
  if (!preparations || !rows || !rules)
    return (
      <section aria-label="Produção da cozinha">
        <h3>Produção da cozinha</h3>
        <p>Carregando produções…</p>
      </section>
    );

  const selectedPreparation = preparations.find((p) => p.id === productId);
  const unit = selectedPreparation?.unit ?? '';
  const storage = selectedPreparation?.storage_condition ?? null;
  const shownProducedAt = producedAt || instantToZoned(now(), timezone);
  const instant = producedTouched
    ? zonedToInstant(producedAt, timezone)
    : now().toISOString();
  // Fatia 7.7: a janela da preparação, se houver, vale no lugar da janela da unidade.
  const windowMinutes =
    selectedPreparation?.production_window_minutes ??
    rules.production_window_minutes;
  const late = instant
    ? now().getTime() - new Date(instant).getTime() > windowMinutes * 60000
    : false;
  const lateText = productionLateText(windowMinutes);
  const canRegister = canCreate || rules.production_registrar === 'member';
  const producedDate = producedTouched
    ? localDateOf(producedAt)
    : localDateOf(instantToZoned(now(), timezone));
  const days =
    producedDate && expiry ? daysBetween(producedDate, expiry) : null;
  const people = members.filter((member) => member.display_name);
  const selected = members.find((member) => member.user_id === handledBy);

  function build() {
    if (!instant) return null;
    return productionInputSchema.safeParse({
      productId,
      quantity,
      expiryDate: expiry,
      producedAt: instant,
      handledBy,
      note: note.trim() ? note : null,
      lateReason: late ? lateReason : null,
      intentId: ensureIntent(),
    });
  }
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!selectedPreparation) return setError('Selecione a preparação.');
    if (!storage)
      return setError(
        'Defina a conservação da preparação no catálogo antes de registrar a produção.',
      );
    if (!isQuantity(quantity))
      return setError(
        `Informe a quantidade produzida em ${unit}, com ponto para decimais, por exemplo 0.5.`,
      );
    if (unit === 'un' && quantity.includes('.'))
      return setError('Esta preparação é medida em unidades inteiras.');
    if (!instant) return setError('Informe a data e a hora da produção.');
    if (new Date(instant).getTime() > now().getTime())
      return setError('O horário da produção não pode estar no futuro.');
    if (late && !lateReason.trim())
      return setError(
        `Produção registrada mais de ${durationText(windowMinutes)} depois de feita exige justificativa do atraso.`,
      );
    if (!expiry) return setError('Informe a validade.');
    if (days === null) return setError('Informe uma validade válida.');
    if (days < 0)
      return setError('A validade não pode ser anterior à data da produção.');
    if (!handledBy)
      return setError(
        'Selecione quem produziu, com nome de exibição definido.',
      );
    if (!selected?.display_name)
      return setError(
        canCreate
          ? 'Defina o nome de exibição da pessoa que produziu antes de registrar.'
          : OWN_NAME_TEXT,
      );
    const parsed = build();
    if (!parsed?.success)
      return setError(
        'Confira a quantidade, o horário, a validade e a observação.',
      );
    setSameDay(false);
    setStage('review');
  }
  async function confirm() {
    if (busy) return;
    const parsed = build();
    if (!parsed?.success) return setStage('form');
    setBusy(true);
    setError('');
    try {
      const batchId = await gateway.register(
        { organizationId, establishmentId },
        parsed.data,
      );
      resetIntent();
      setResult({ batchId, late });
      setStage('done');
      reloadList();
      onChanged?.();
    } catch (cause) {
      if (cause instanceof ProductionRejected) {
        setError(cause.message);
        if (cause.conflict) setConflict(true);
        else resetIntent();
      } else setError(INTENT_ERROR);
      setStage('form');
    } finally {
      setBusy(false);
    }
  }
  async function defineName() {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      const target = { organizationId, establishmentId };
      await setDisplayName(target, selected.user_id, nameDraft);
      setMembers(await loadMembers(target));
      setNameDraft('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível definir.',
      );
    } finally {
      setBusy(false);
    }
  }

  const created = result
    ? rows.find((row) => row.batch_id === result.batchId)
    : undefined;

  return (
    <section aria-label="Produção da cozinha">
      <h3>Produção da cozinha</h3>
      <p>
        Preparações feitas na cozinha, com validade informada pelo responsável.
      </p>
      {notice && <p role="status">{notice}</p>}
      <h4>Produções recentes</h4>
      {rows.length === 0 ? (
        <p>Nenhuma produção registrada.</p>
      ) : (
        <ul aria-label="Produções recentes">
          {rows.map((row) => (
            <li key={row.batch_id}>
              {row.product_name}
              {row.short_code && ` — ${row.short_code}`} — {row.quantity}{' '}
              {row.unit} — produzida em {when(row.produced_at, row.timezone)}{' '}
              por {row.handled_by_name} — validade {formatDate(row.expiry_date)}{' '}
              (definida pelo responsável)
              {row.late &&
                ` — registrada fora da janela de ${durationText(row.late_window_minutes ?? 120)}`}
              {labels && row.container_id && !row.voided && (
                <>
                  {' '}
                  <DownloadLabels
                    gateway={labels}
                    ids={[row.container_id]}
                    filename={`etiqueta-${row.container_id}.pdf`}
                    label={`Baixar etiqueta${row.short_code ? ` (${row.short_code})` : ''}`}
                  />
                </>
              )}
              {row.voided ? (
                <strong>
                  {' '}
                  — ANULADA em {when(row.voided.created_at, row.timezone)}:{' '}
                  {row.voided.reason}
                </strong>
              ) : (
                canCreate && (
                  <>
                    {' '}
                    <VoidProduction
                      scope={{ organizationId, establishmentId }}
                      batchId={row.batch_id}
                      label={row.short_code ?? row.product_name}
                      gateway={gateway}
                      onVoided={() => {
                        setNotice(
                          'Produção anulada: o saldo do lote foi zerado. Para corrigir, registre a produção de novo.',
                        );
                        reloadList();
                        onChanged?.();
                      }}
                    />
                  </>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.length >= 50 && (
        <p role="status">A lista mostra as 50 produções mais recentes.</p>
      )}
      {!canRegister && (
        <p>Somente o proprietário registra ou anula produção.</p>
      )}
      {canRegister && !canCreate && (
        <p>
          Você registra só a própria produção. Somente o proprietário anula
          produção.
        </p>
      )}
      {canRegister && stage === 'done' && result && (
        <section aria-label="Resultado da produção">
          <h4>Produção registrada</h4>
          <p role="status">
            Produção registrada
            {created?.short_code ? ` no recipiente ${created.short_code}` : ''}.
            {result.late &&
              ' O lote fica bloqueado até a decisão do proprietário (veja Bloqueios e ocorrências).'}
          </p>
          {labels && created?.container_id && (
            <p>
              <DownloadLabels
                gateway={labels}
                ids={[created.container_id]}
                filename={`etiqueta-${created.container_id}.pdf`}
                label="Baixar etiqueta"
              />
            </p>
          )}
          <p>
            Para corrigir um erro de digitação, anule a produção na lista acima
            antes de qualquer uso e registre de novo.
          </p>
          <button type="button" onClick={startForm}>
            Registrar outra produção
          </button>{' '}
          <button type="button" onClick={() => setStage('closed')}>
            Fechar
          </button>
        </section>
      )}
      {canRegister && stage === 'review' && selectedPreparation && (
        <section aria-label="Revisão da produção">
          <h4>Revise antes de confirmar</h4>
          <ul>
            <li>Preparação: {selectedPreparation.name}</li>
            <li>
              Quantidade: {quantity} {unit}
            </li>
            <li>
              Produzida em: {shownProducedAt.replace('T', ' ')} (fuso {timezone}
              ){late && ` — ${lateText} Justificativa: ${lateReason.trim()}`}
            </li>
            <li>
              <strong>
                Validade{' '}
                {producedDate ? expiryInWords(producedDate, expiry) : expiry}
              </strong>{' '}
              (definida pelo responsável; a contagem de dias é só para conferir
              o que foi digitado)
            </li>
            <li>Conservação: {storage ? storageLabels[storage] : ''}</li>
            <li>Produzida por: {selected?.display_name ?? ''}</li>
            {note.trim() && <li>Observação: {note.trim()}</li>}
          </ul>
          {days === 0 && (
            <p>
              <label>
                <input
                  type="checkbox"
                  checked={sameDay}
                  onChange={(event) => setSameDay(event.target.checked)}
                />{' '}
                {SAME_DAY_TEXT}
              </label>
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            type="button"
            disabled={busy || (days === 0 && !sameDay)}
            onClick={() => void confirm()}
          >
            Confirmar produção
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
      {canRegister && stage === 'closed' && (
        <button type="button" onClick={startForm}>
          Registrar produção
        </button>
      )}
      {canRegister && stage === 'form' && (
        <form aria-label="Registrar produção" onSubmit={review}>
          <h4>Registrar produção</h4>
          {preparations.length === 0 && (
            <p>Cadastre uma preparação própria no catálogo primeiro.</p>
          )}
          <fieldset disabled={busy}>
            <p>
              <label>
                Preparação{' '}
                <select
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                >
                  <option value="" disabled>
                    Selecione
                  </option>
                  {preparations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.unit})
                    </option>
                  ))}
                </select>
              </label>
            </p>
            {selectedPreparation && !storage && (
              <p role="alert">
                Defina a conservação da preparação no catálogo antes de
                registrar a produção.
              </p>
            )}
            {storage && (
              <p>
                Conservação: {storageLabels[storage]} (definida na preparação)
              </p>
            )}
            <p>
              <label>
                Quantidade produzida{unit && ` (${unit})`}{' '}
                <input
                  inputMode="decimal"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>
            </p>
            <p>
              <label>
                Produzida em (fuso {timezone}){' '}
                <input
                  type="datetime-local"
                  value={shownProducedAt}
                  onChange={(event) => {
                    setProducedTouched(true);
                    setProducedAt(event.target.value);
                  }}
                />
              </label>{' '}
              Fim do preparo ou início do resfriamento.
            </p>
            {late && (
              <>
                <p role="note">{lateText}</p>
                <p>
                  <label>
                    Justificativa do atraso{' '}
                    <textarea
                      value={lateReason}
                      maxLength={300}
                      onChange={(event) => setLateReason(event.target.value)}
                    />
                  </label>
                </p>
              </>
            )}
            <p>
              <label>
                Validade{' '}
                <input
                  type="date"
                  value={expiry}
                  onChange={(event) => setExpiry(event.target.value)}
                />
              </label>{' '}
              {PRODUCTION_EXPIRY_TEXT}
            </p>
            <p>
              <label>
                Produzida por{' '}
                <select
                  value={selected?.display_name ? handledBy : ''}
                  onChange={(event) => setHandledBy(event.target.value)}
                >
                  <option value="" disabled>
                    Selecione
                  </option>
                  {people.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name}
                    </option>
                  ))}
                </select>
              </label>
            </p>
            {!canCreate && !selected?.display_name && (
              <p role="alert">{OWN_NAME_TEXT}</p>
            )}
            {canCreate && members.some((member) => !member.display_name) && (
              <p>
                <label>
                  Pessoa sem nome de exibição{' '}
                  <select
                    aria-label="Pessoa sem nome de exibição"
                    value={
                      handledBy && !selected?.display_name ? handledBy : ''
                    }
                    onChange={(event) => setHandledBy(event.target.value)}
                  >
                    <option value="">Selecione</option>
                    {members
                      .filter((member) => !member.display_name)
                      .map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.user_id === userId
                            ? 'Você'
                            : member.role === 'owner'
                              ? 'Proprietário'
                              : 'Colaborador'}{' '}
                          (sem nome)
                        </option>
                      ))}
                  </select>
                </label>
                {selected && !selected.display_name && (
                  <>
                    {' '}
                    <label>
                      Nome (até 40 caracteres){' '}
                      <input
                        value={nameDraft}
                        maxLength={40}
                        onChange={(event) => setNameDraft(event.target.value)}
                      />
                    </label>{' '}
                    <button
                      type="button"
                      disabled={!nameDraft.trim()}
                      onClick={() => void defineName()}
                    >
                      Definir nome
                    </button>
                  </>
                )}
              </p>
            )}
            <p>
              <label>
                Observação (opcional){' '}
                <input
                  value={note}
                  maxLength={300}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            </p>
          </fieldset>
          {error && <p role="alert">{error}</p>}
          {conflict && (
            <button
              type="button"
              onClick={() => {
                resetIntent();
                setConflict(false);
                setError('');
              }}
            >
              Já conferi; iniciar nova tentativa
            </button>
          )}
          <button type="submit" disabled={busy || conflict}>
            Revisar produção
          </button>{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStage('closed');
              setError('');
            }}
          >
            Cancelar
          </button>
        </form>
      )}
    </section>
  );
}

export function ProductionPanel(props: Props) {
  return (
    <ProductionContents
      key={`${props.scope.organizationId}:${props.scope.establishmentId}`}
      {...props}
    />
  );
}
