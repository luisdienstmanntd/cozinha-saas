import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogScope } from '../../catalog/domain/catalog';
import { storageLabels, storageConditions } from '../../catalog/domain/catalog';
import type { StorageCondition } from '../../catalog/domain/catalog';
import { BLOCK_TEXT } from '../../occurrences/domain/occurrence';
import type { HandlingGateway } from '../application/handlingGateway';
import { HandlingRejected } from '../application/handlingGateway';
import type { HandlingContext, Member, OpeningInfo } from '../domain/family';
import {
  MAX_PORTIONS,
  MIN_PORTIONS,
  formatDate,
  fromMilli,
  handlingInputSchema,
  instantToZoned,
  isLate,
  isQuantity,
  kindLabels,
  splitEqually,
  totals,
  zonedToInstant,
} from '../domain/handling';
import { VoidHandling } from './VoidHandling';

// Desenho 7.1: abrir embalagem ou dividir em porções. Passos: formulário, revisão, confirmação e
// resultado (com "Anular manipulação"). Nenhum prazo é sugerido ou calculado; o banco confere tudo.
export const EXPIRY_TEXT =
  'Informe a validade após a abertura definida pelo responsável. O sistema não calcula prazos.';
export const LATE_TEXT =
  'Registro fora da janela. Ficará bloqueado até a decisão do responsável.';
export const FREEZE_TEXT =
  'Congelar não prorroga a validade nesta versão. Não registre um recebimento novo para isso.';
type Remainder = 'none' | 'sealed' | 'discard' | 'portion';
type Stage = 'form' | 'review' | 'done';

function memberName(members: Member[], id: string) {
  return members.find((member) => member.user_id === id)?.display_name ?? null;
}

export function HandlingForm({
  scope,
  containerId,
  userId,
  gateway,
  now = () => new Date(),
  onClose,
  onChanged,
  onOpenContainer,
}: {
  scope: CatalogScope;
  containerId: string;
  userId: string;
  gateway: HandlingGateway;
  now?: () => Date;
  onClose: () => void;
  // Algo foi gravado (manipulação ou anulação): a tela de origem relê o que mostra.
  onChanged?: () => void;
  onOpenContainer?: (id: string) => void;
}) {
  const [context, setContext] = useState<HandlingContext | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadError, setLoadError] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [kind, setKind] = useState<'opening' | 'portioning'>('opening');
  const [count, setCount] = useState(2);
  const [quantities, setQuantities] = useState<string[]>(['']);
  const [remainder, setRemainder] = useState<Remainder | ''>('');
  const [sealed, setSealed] = useState<'yes' | 'no' | ''>('');
  const [remainderReason, setRemainderReason] = useState('');
  const [handledAt, setHandledAt] = useState('');
  // Sem edição, vale o instante exato do registro (com segundos): o horário truncado ao minuto poderia
  // cair antes da criação do recipiente e ser recusado.
  const [handledTouched, setHandledTouched] = useState(false);
  const [expiry, setExpiry] = useState('');
  const [storage, setStorage] = useState<StorageCondition | ''>('');
  const [handledBy, setHandledBy] = useState('');
  const [note, setNote] = useState('');
  const [lateReason, setLateReason] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [result, setResult] = useState<OpeningInfo | null>(null);
  const [voided, setVoided] = useState(false);
  const intent = useRef<string | null>(null);
  const key = `handling-intent:${userId}:${scope.organizationId}:${scope.establishmentId}:${containerId}`;

  useEffect(() => {
    let current = true;
    void Promise.all([
      gateway.context(scope, containerId),
      gateway.members(scope),
    ]).then(
      ([loaded, people]) => {
        if (!current) return;
        setContext(loaded);
        setMembers(people);
        setStorage(loaded.storage ?? '');
        setHandledAt(instantToZoned(now(), loaded.timezone));
        const self = people.find((p) => p.user_id === userId);
        setHandledBy(self?.display_name ? userId : '');
      },
      () => {
        if (current) setLoadError('Recipiente indisponível ou sem acesso.');
      },
    );
    return () => {
      current = false;
    };
    // `now` é só para teste; a carga acontece uma vez por recipiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gateway,
    scope.organizationId,
    scope.establishmentId,
    containerId,
    userId,
  ]);

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!context) return <p>Consultando recipiente…</p>;
  const unit = context.unit;
  const integral = context.kind === 'integral';
  const wholeUnits = unit === 'un';

  if (context.block)
    return (
      <section aria-label="Abrir ou porcionar">
        <h4>Abrir / porcionar {context.short_code}</h4>
        <p role="status">
          <strong>{BLOCK_TEXT[context.block]}</strong>: este recipiente não pode
          ser manipulado. Só o descarte é permitido.
        </p>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </section>
    );
  if (context.balance <= 0)
    return (
      <section aria-label="Abrir ou porcionar">
        <h4>Abrir / porcionar {context.short_code}</h4>
        <p role="status">Recipiente sem saldo registrado.</p>
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </section>
    );

  const portionQuantities =
    kind === 'opening' ? quantities.slice(0, 1) : quantities.slice(0, count);
  const { sumMilli, restMilli } = totals(portionQuantities, context.balance);
  const allValid = portionQuantities.every(isQuantity);
  const exceeds = restMilli < 0;
  const hasRest = allValid && restMilli > 0;
  const instant = handledTouched
    ? zonedToInstant(handledAt, context.timezone)
    : now().toISOString();
  const late = instant ? isLate(instant, now()) : false;
  const people = members.filter((member) => member.display_name);
  const selected = members.find((member) => member.user_id === handledBy);
  const freezing = storage === 'frozen' && context.storage !== 'frozen';
  const remainderChoices: { value: Remainder; label: string }[] = [
    ...(integral && sealed === 'yes'
      ? [{ value: 'sealed' as const, label: 'sim' }]
      : []),
    ...(sealed === 'no' || !integral
      ? [
          ...(kind === 'portioning'
            ? [{ value: 'portion' as const, label: 'Incluir como porção' }]
            : []),
          { value: 'discard' as const, label: 'Descartar' },
        ]
      : []),
  ];

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
  function changeKind(next: 'opening' | 'portioning') {
    setKind(next);
    setQuantities(next === 'opening' ? [''] : Array(count).fill(''));
    setRemainder('');
    setSealed('');
    setError('');
  }
  function changeCount(next: number) {
    const value = Math.min(MAX_PORTIONS, Math.max(MIN_PORTIONS, next || 0));
    setCount(value);
    setQuantities((previous) =>
      Array.from({ length: value }, (_, index) => previous[index] ?? ''),
    );
  }
  function setQuantity(index: number, value: string) {
    setQuantities((previous) => {
      const copy = [...previous];
      copy[index] = value;
      return copy;
    });
  }
  function effectiveRemainder(): Remainder | null {
    if (!hasRest) return allValid && !exceeds ? 'none' : null;
    if (integral && sealed === 'yes') return 'sealed';
    return remainder || null;
  }
  function build() {
    const chosen = effectiveRemainder();
    if (!chosen || !instant) return null;
    return handlingInputSchema.safeParse({
      sourceContainerId: containerId,
      kind,
      quantities: portionQuantities,
      expiryDate: expiry,
      storage,
      handledAt: instant,
      handledBy,
      remainder: chosen,
      remainderReason: chosen === 'discard' ? remainderReason : null,
      note: note.trim() ? note : null,
      lateReason: late ? lateReason : null,
      intentId: ensureIntent(),
    });
  }
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!allValid || portionQuantities.length === 0)
      return setError(
        `Informe a quantidade de cada porção em ${unit}, com ponto para decimais, por exemplo 0.5.`,
      );
    if (wholeUnits && portionQuantities.some((q) => q.includes('.')))
      return setError('Este produto é medido em unidades inteiras.');
    if (exceeds) return setError('Quantidade excede saldo registrado.');
    if (hasRest && !effectiveRemainder())
      return setError('Informe o que acontece com a sobra.');
    if (!instant) return setError('Informe a data e a hora da manipulação.');
    if (late && !lateReason.trim())
      return setError(
        'Manipulação registrada mais de 2 horas depois de feita exige justificativa do atraso.',
      );
    if (!expiry) return setError('Informe a validade após a abertura.');
    if (!storage) return setError('Selecione a conservação.');
    if (!handledBy)
      return setError(
        'Selecione quem manipulou, com nome de exibição definido.',
      );
    const parsed = build();
    if (!parsed?.success)
      return setError(
        'Confira as quantidades, a sobra, as datas e os motivos informados.',
      );
    setStage('review');
  }
  async function confirm() {
    if (busy) return;
    const parsed = build();
    if (!parsed?.success) return setStage('form');
    setBusy(true);
    setError('');
    try {
      const id = await gateway.handle(scope, parsed.data);
      resetIntent();
      onChanged?.();
      setResult(await gateway.created(scope, id));
      setStage('done');
    } catch (cause) {
      if (cause instanceof HandlingRejected) {
        setError(cause.message);
        if (cause.conflict) setConflict(true);
        else resetIntent();
      } else {
        setError(
          'Não foi possível confirmar o registro. Repita a mesma tentativa; não crie outra sem conferir os recipientes.',
        );
      }
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
      await gateway.setDisplayName(scope, selected.user_id, nameDraft);
      setMembers(await gateway.members(scope));
      setNameDraft('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível definir.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'done' && result) {
    const info = result.handling;
    return (
      <section aria-label="Resultado da manipulação">
        <h4>
          {voided
            ? 'Manipulação anulada'
            : `${kindLabels[info.kind]} registrada`}
        </h4>
        {voided ? (
          <p role="status">
            Manipulação anulada: a quantidade voltou para {context.short_code} e
            os recipientes abaixo ficaram zerados e sem etiqueta.
          </p>
        ) : (
          <p role="status">
            Registrado. Validade após abertura: {formatDate(info.expiry_date)}.
            {late &&
              ' Os recipientes ficam bloqueados até a decisão do proprietário (veja Bloqueios e ocorrências).'}
          </p>
        )}
        <ul aria-label="Recipientes criados">
          {result.children.map((child) => (
            <li key={child.id}>
              {child.short_code}
              {child.position && info.kind === 'portioning'
                ? ` — porção ${child.position}`
                : ''}{' '}
              — {voided ? 0 : child.initial_quantity} {unit}
              {onOpenContainer && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() => onOpenContainer(child.id)}
                  >
                    Abrir {child.short_code}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        {info.remainder === 'sealed' && (
          <p>
            Sobra de {info.remainder_quantity} {unit} segue fechada na embalagem
            original ({context.short_code}).
          </p>
        )}
        {info.remainder === 'discarded' && (
          <p>
            Sobra de {info.remainder_quantity} {unit} descartada.
          </p>
        )}
        <p>
          As etiquetas de produto aberto ou fracionado chegam na próxima fatia;
          até lá, anote o código curto no recipiente.
        </p>
        {!voided && (
          <VoidHandling
            scope={scope}
            handlingId={info.id}
            gateway={gateway}
            onVoided={() => {
              setVoided(true);
              onChanged?.();
            }}
          />
        )}{' '}
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </section>
    );
  }

  if (stage === 'review')
    return (
      <section aria-label="Revisão da manipulação">
        <h4>Revise antes de confirmar</h4>
        <ul>
          <li>
            {context.product_name} — {context.short_code} — lote{' '}
            {context.source_code}
          </li>
          <li>
            {kind === 'opening' ? 'Abrir embalagem' : 'Dividir em porções'}:{' '}
            {portionQuantities.map((q) => `${q} ${unit}`).join(' + ')} (total{' '}
            {fromMilli(sumMilli)} {unit})
          </li>
          <li>
            Sobra:{' '}
            {restMilli === 0
              ? 'nenhuma'
              : `${fromMilli(restMilli)} ${unit} — ${
                  effectiveRemainder() === 'sealed'
                    ? 'continua fechada na embalagem original'
                    : effectiveRemainder() === 'portion'
                      ? 'incluída como porção'
                      : `descartada (${remainderReason.trim()})`
                }`}
          </li>
          <li>
            Aberto em: {handledAt.replace('T', ' ')} (fuso {context.timezone})
            {late && ` — ${LATE_TEXT} Justificativa: ${lateReason.trim()}`}
          </li>
          <li>Validade após a abertura: {formatDate(expiry)}</li>
          <li>Conservação: {storage ? storageLabels[storage] : ''}</li>
          <li>Manipulado por: {selected?.display_name ?? ''}</li>
          <li>Registrado por: {memberName(members, userId) ?? 'você'}</li>
          {note.trim() && <li>Observação: {note.trim()}</li>}
        </ul>
        {freezing && <p role="note">{FREEZE_TEXT}</p>}
        {error && <p role="alert">{error}</p>}
        <button type="button" disabled={busy} onClick={() => void confirm()}>
          Confirmar registro
        </button>{' '}
        <button type="button" disabled={busy} onClick={() => setStage('form')}>
          Voltar e corrigir
        </button>
      </section>
    );

  return (
    <section aria-label="Abrir ou porcionar">
      <h4>
        Abrir / porcionar {context.short_code} — {context.product_name}
      </h4>
      <p>
        Lote {context.source_code} — saldo {context.balance} {unit} — validade{' '}
        {formatDate(context.expiry_date)} —{' '}
        {context.storage
          ? storageLabels[context.storage]
          : 'conservação não registrada'}{' '}
        —{' '}
        {integral
          ? 'embalagem fechada (integral)'
          : 'recipiente já aberto (derivado)'}
      </p>
      <form onSubmit={review}>
        <fieldset disabled={busy}>
          <legend>Tipo e quantidade</legend>
          <label>
            <input
              type="radio"
              name="kind"
              checked={kind === 'opening'}
              onChange={() => changeKind('opening')}
            />{' '}
            Abrir embalagem
          </label>{' '}
          <label>
            <input
              type="radio"
              name="kind"
              checked={kind === 'portioning'}
              onChange={() => changeKind('portioning')}
            />{' '}
            Dividir em porções
          </label>
          {kind === 'portioning' && (
            <p>
              <label>
                Número de porções ({MIN_PORTIONS} a {MAX_PORTIONS}){' '}
                <input
                  type="number"
                  min={MIN_PORTIONS}
                  max={MAX_PORTIONS}
                  value={count}
                  onChange={(event) => changeCount(Number(event.target.value))}
                />
              </label>{' '}
              <button
                type="button"
                onClick={() =>
                  setQuantities(
                    splitEqually(context.balance, count, wholeUnits),
                  )
                }
              >
                Dividir igualmente
              </button>
            </p>
          )}
          {portionQuantities.map((value, index) => (
            <p key={index}>
              <label>
                {kind === 'opening'
                  ? `Quantidade aberta (${unit})`
                  : `Porção ${index + 1} (${unit})`}{' '}
                <input
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => setQuantity(index, event.target.value)}
                />
              </label>
            </p>
          ))}
          <p>
            Use ponto para decimais, por exemplo 0.5. Soma:{' '}
            {fromMilli(sumMilli)} {unit} de {context.balance} {unit}
            {allValid &&
              (exceeds
                ? ' — excede o saldo registrado.'
                : ` — sobra: ${fromMilli(restMilli) || '0'} ${unit}.`)}
          </p>
        </fieldset>
        {hasRest && (
          <fieldset disabled={busy}>
            <legend>
              Sobra de {fromMilli(restMilli)} {unit}
            </legend>
            {integral && (
              <>
                <p>O restante continua fechado na embalagem original?</p>
                <label>
                  <input
                    type="radio"
                    name="sealed"
                    checked={sealed === 'yes'}
                    onChange={() => {
                      setSealed('yes');
                      setRemainder('sealed');
                    }}
                  />{' '}
                  Sim, continua fechado
                </label>{' '}
                <label>
                  <input
                    type="radio"
                    name="sealed"
                    checked={sealed === 'no'}
                    onChange={() => {
                      setSealed('no');
                      setRemainder('');
                    }}
                  />{' '}
                  Não
                </label>
              </>
            )}
            {(sealed === 'no' || !integral) && (
              <>
                {!integral && (
                  <p>
                    Origem já aberta: a sobra não volta a ser “fechada”. Inclua
                    como porção ou descarte.
                  </p>
                )}
                {remainderChoices.map((choice) => (
                  <label key={choice.value}>
                    <input
                      type="radio"
                      name="remainder"
                      checked={remainder === choice.value}
                      onChange={() => setRemainder(choice.value)}
                    />{' '}
                    {choice.label}{' '}
                  </label>
                ))}
              </>
            )}
            {remainder === 'discard' && (sealed === 'no' || !integral) && (
              <p>
                <label>
                  Motivo do descarte da sobra{' '}
                  <input
                    value={remainderReason}
                    maxLength={500}
                    onChange={(event) => setRemainderReason(event.target.value)}
                  />
                </label>
              </p>
            )}
          </fieldset>
        )}
        <fieldset disabled={busy}>
          <legend>Quando e como</legend>
          <p>
            <label>
              Aberto em (fuso {context.timezone}){' '}
              <input
                type="datetime-local"
                value={handledAt}
                onChange={(event) => {
                  setHandledTouched(true);
                  setHandledAt(event.target.value);
                }}
              />
            </label>
          </p>
          {late && (
            <>
              <p role="note">{LATE_TEXT}</p>
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
              Validade após a abertura{' '}
              <input
                type="date"
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
              />
            </label>
          </p>
          <p>
            {EXPIRY_TEXT} A validade da origem é{' '}
            {formatDate(context.expiry_date)}: a validade após a abertura não
            pode passar dela.
          </p>
          <p>
            <label>
              Conservação{' '}
              <select
                value={storage}
                onChange={(event) =>
                  setStorage(event.target.value as StorageCondition)
                }
              >
                <option value="" disabled>
                  Selecione
                </option>
                {storageConditions.map((condition) => (
                  <option key={condition} value={condition}>
                    {storageLabels[condition]}
                  </option>
                ))}
              </select>
            </label>
          </p>
          {freezing && <p role="note">{FREEZE_TEXT}</p>}
          <p>
            <label>
              Manipulado por{' '}
              <select
                value={handledBy}
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
          {members.some((member) => !member.display_name) && (
            <p>
              <label>
                Pessoa sem nome de exibição{' '}
                <select
                  aria-label="Pessoa sem nome de exibição"
                  value={handledBy && !selected?.display_name ? handledBy : ''}
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
                    Nome curto (até 40 caracteres){' '}
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
                maxLength={200}
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
          Revisar registro
        </button>{' '}
        <button type="button" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
      </form>
    </section>
  );
}
