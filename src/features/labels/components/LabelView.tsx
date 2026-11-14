import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LabelGateway } from '../application/labelGateway';
import type { LabelData } from '../domain/label';
import { LATE_HOLD_MESSAGE } from '../domain/label';
import type { HandlingGateway } from '../../handling/application/handlingGateway';
import type { Family } from '../../handling/domain/family';
import { HandlingForm } from '../../handling/components/HandlingForm';
import { VoidHandling } from '../../handling/components/VoidHandling';
import { formatDate, kindLabels } from '../../handling/domain/handling';
import { BLOCK_TEXT } from '../../occurrences/domain/occurrence';
import { DownloadLabels } from './DownloadLabels';
import {
  EXPIRED_NOTE,
  EXPIRED_TEXT,
  isExpired,
} from '../../batches/domain/expiryStatus';

export function LabelView({
  id,
  gateway,
  handling,
  canHandle,
  userId,
  onOpenContainer,
}: {
  id: string;
  gateway: LabelGateway;
  // Fatia 6.6: origem, derivados e ações de manipulação. Sem `handling`, a tela é a das fatias anteriores.
  handling?: HandlingGateway;
  // Só o proprietário da organização do recipiente escreve (D-019).
  canHandle?: (organizationId: string) => boolean;
  userId?: string;
  onOpenContainer?: (id: string) => void;
}) {
  const [family, setFamily] = useState<Family | null>(null);
  const [familyError, setFamilyError] = useState('');
  const [reload, setReload] = useState(0);
  const [handlingOpen, setHandlingOpen] = useState(false);
  const [data, setData] = useState<LabelData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const version = ++generation.current;
    let current = true;
    void gateway.get(id).then(
      (value) => {
        if (current) setData(value);
      },
      () => {
        if (current) setError('Recipiente indisponível ou sem acesso.');
      },
    );
    return () => {
      current = false;
      generation.current = version + 1;
    };
  }, [gateway, id, reload]);
  const scopeIds = data?.organization_id && data.establishment_id;
  const organizationId = data?.organization_id;
  const establishmentId = data?.establishment_id;
  useEffect(() => {
    if (!handling || !organizationId || !establishmentId) return;
    let current = true;
    void handling.family({ organizationId, establishmentId }, id).then(
      (value) => {
        if (current) {
          setFamily(value);
          setFamilyError('');
        }
      },
      () => {
        if (current)
          setFamilyError('Não foi possível consultar a origem e os derivados.');
      },
    );
    return () => {
      current = false;
    };
  }, [handling, organizationId, establishmentId, id, reload]);
  async function download() {
    if (!data) return;
    const version = generation.current;
    const isCurrent = () => generation.current === version;
    setBusy(true);
    setError('');
    let fresh: LabelData;
    try {
      // Reauthorize immediately before generating each copy.
      fresh = await gateway.get(id);
    } catch {
      if (!isCurrent()) return;
      setData(null);
      setError('Recipiente indisponível ou sem acesso.');
      setBusy(false);
      return;
    }
    if (!isCurrent()) return;
    if (fresh.voided || fresh.late_hold) {
      setData(fresh);
      setBusy(false);
      return;
    }
    try {
      setData(fresh);
      const { makeLabelPdf } = await import('../application/pdf');
      const blob = await makeLabelPdf(fresh, window.location.origin);
      if (!isCurrent()) return;
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `etiqueta-${fresh.id}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (cause) {
      if (!isCurrent()) return;
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível gerar a etiqueta.',
      );
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }
  return (
    <section aria-label="Recipiente">
      <h2>Recipiente</h2>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Consultando recipiente…</p>}
      {data && (
        <>
          <p>
            {data.kind === 'derived'
              ? 'Recipiente derivado de uma manipulação (produto aberto ou fracionado).'
              : 'Um recipiente integral corresponde a este recebimento.'}
          </p>
          <p>
            {data.batch_receipts.products.name} — lote{' '}
            {data.batch_receipts.source_code}
          </p>
          <p>
            Quantidade inicial:{' '}
            {data.effective?.initial_quantity ?? data.batch_receipts.quantity}{' '}
            {data.batch_receipts.unit} — validade{' '}
            {data.effective?.expiry_date ?? data.batch_receipts.expiry_date} (
            {data.effective?.expiry_origin === 'handling'
              ? 'após manipulação'
              : data.batch_receipts.expiry_origin === 'original'
                ? 'original'
                : 'definida pelo responsável'}
            )
          </p>
          <p>
            Saldo atual: {data.balance} {data.batch_receipts.unit}
            {data.balance <= 0 && ' — esgotado, sem saldo neste recipiente'}
          </p>
          {!data.voided &&
            data.balance > 0 &&
            data.batch_receipts.timezone &&
            isExpired(
              data.effective?.expiry_date ?? data.batch_receipts.expiry_date,
              data.batch_receipts.timezone,
            ) && (
              <p role="status" className="expired-band">
                <strong>{EXPIRED_TEXT}</strong>: {EXPIRED_NOTE}
              </p>
            )}
          {data.hold && !data.voided && !data.late_hold && (
            <p role="status">
              <strong>{BLOCK_TEXT[data.hold]}</strong>
              {data.hold === 'pending'
                ? ': ocorrência sem decisão do proprietário. Consumo e manipulação ficam recusados; a etiqueta sai com a faixa de bloqueio.'
                : ': o proprietário rejeitou o uso. Só o descarte é permitido; a etiqueta sai com a faixa.'}
            </p>
          )}
          <p>Código: {data.short_code}</p>
          <p>Identificação: {data.id}</p>
          <p>
            Modelo PDF de demonstração: 100 × 100 mm. A impressão e a leitura
            física ainda não foram validadas.
          </p>
          {['localhost', '127.0.0.1', '[::1]'].includes(
            window.location.hostname,
          ) && (
            <p>
              O QR usa endereço local e não abre este computador em outro
              dispositivo.
            </p>
          )}
          {data.voided ? (
            <p role="alert">
              Manipulação anulada: este recipiente não vale mais e a etiqueta
              não pode ser gerada.
            </p>
          ) : data.late_hold ? (
            <p role="alert">{LATE_HOLD_MESSAGE}</p>
          ) : (
            <button disabled={busy} onClick={() => void download()}>
              Gerar etiqueta PDF
            </button>
          )}
          {handling && scopeIds && (
            <section aria-label="Origem e derivados">
              <h3>Origem e derivados</h3>
              {familyError && <p role="alert">{familyError}</p>}
              {family?.partial && (
                <p role="note">
                  O recebimento tem mais recipientes do que esta tela mostra.
                </p>
              )}
              {family?.created && (
                <FamilyOrigin
                  family={family}
                  data={data}
                  onOpen={onOpenContainer}
                  action={
                    canHandle?.(data.organization_id!) &&
                    !family.created.voided ? (
                      <VoidHandling
                        scope={{
                          organizationId: data.organization_id!,
                          establishmentId: data.establishment_id!,
                        }}
                        handlingId={family.created.handling.id}
                        gateway={handling}
                        onVoided={() => setReload((value) => value + 1)}
                      />
                    ) : null
                  }
                />
              )}
              {family && family.openings.length > 0 && (
                <FamilyOpenings
                  family={family}
                  data={data}
                  gateway={gateway}
                  onOpen={onOpenContainer}
                />
              )}
              {family && !family.created && family.openings.length === 0 && (
                <p>Este recipiente ainda não foi aberto nem porcionado.</p>
              )}
              {canHandle?.(data.organization_id!) &&
                userId &&
                !data.voided &&
                data.balance > 0 && (
                  <>
                    {!handlingOpen && (
                      <button
                        type="button"
                        onClick={() => setHandlingOpen(true)}
                      >
                        Abrir / porcionar
                      </button>
                    )}
                    {handlingOpen && (
                      <HandlingForm
                        key={`${id}-${reload}`}
                        scope={{
                          organizationId: data.organization_id!,
                          establishmentId: data.establishment_id!,
                        }}
                        containerId={id}
                        userId={userId}
                        gateway={handling}
                        labels={gateway}
                        onClose={() => setHandlingOpen(false)}
                        onChanged={() => setReload((value) => value + 1)}
                        onOpenContainer={onOpenContainer}
                      />
                    )}
                  </>
                )}
              {!canHandle?.(data.organization_id!) && (
                <p>Somente o proprietário abre, porciona ou anula.</p>
              )}
            </section>
          )}
        </>
      )}
    </section>
  );
}

function when(iso: string, zone: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: zone,
  }).format(new Date(iso));
}

function OpenButton({
  id,
  code,
  onOpen,
}: {
  id: string;
  code: string;
  onOpen?: (id: string) => void;
}) {
  if (!onOpen) return <>{code}</>;
  return (
    <button type="button" onClick={() => onOpen(id)}>
      Abrir {code}
    </button>
  );
}

function FamilyOrigin({
  family,
  data,
  onOpen,
  action,
}: {
  family: Family;
  data: LabelData;
  onOpen?: (id: string) => void;
  action: ReactNode;
}) {
  const created = family.created!;
  const h = created.handling;
  const unit = data.batch_receipts.unit;
  return (
    <div>
      <p>
        {created.voided
          ? `Manipulação anulada em ${when(created.voided.created_at, h.timezone)}: ${created.voided.reason}. Este recipiente não vale mais; o saldo voltou para a origem.`
          : `${kindLabels[h.kind]} de ${created.parent?.short_code ?? 'origem'} em ${when(h.handled_at, h.timezone)}${created.position && h.kind === 'portioning' ? ` — porção ${created.position} de ${created.siblings}` : ''}.`}
      </p>
      {created.parent && (
        <p>
          Origem:{' '}
          <OpenButton
            id={created.parent.id}
            code={created.parent.short_code}
            onOpen={onOpen}
          />
        </p>
      )}
      <p>
        Manipulado por {h.handled_by_name} — validade após a abertura{' '}
        {formatDate(h.expiry_date)}.
        {h.remainder === 'discarded' &&
          ` Sobra de ${h.remainder_quantity} ${unit} descartada.`}
      </p>
      {action}
    </div>
  );
}

function FamilyOpenings({
  family,
  data,
  gateway,
  onOpen,
}: {
  family: Family;
  data: LabelData;
  gateway: LabelGateway;
  onOpen?: (id: string) => void;
}) {
  const unit = data.batch_receipts.unit;
  const active = family.openings.filter((o) => !o.voided);
  const live = active.length > 0;
  return (
    <div>
      {live && data.kind === 'integral' && (
        <p role="status">
          Este recipiente foi aberto em{' '}
          {when(active[0]!.handling.handled_at, active[0]!.handling.timezone)}.
          Use a etiqueta nova do produto aberto.
        </p>
      )}
      <ul aria-label="Manipulações deste recipiente">
        {family.openings.map(({ handling: h, voided, children }) => (
          <li key={h.id}>
            {kindLabels[h.kind]} em {when(h.handled_at, h.timezone)} por{' '}
            {h.handled_by_name}
            {voided
              ? ` — anulada em ${when(voided.created_at, h.timezone)}: ${voided.reason}`
              : ` — validade ${formatDate(h.expiry_date)}`}
            {h.remainder === 'sealed' &&
              !voided &&
              ` — sobra de ${h.remainder_quantity} ${unit} segue fechada`}
            {!voided && children.length > 0 && (
              <p>
                <DownloadLabels
                  gateway={gateway}
                  ids={children.map((child) => child.id)}
                  filename={`etiquetas-${h.id}.pdf`}
                  label="Baixar PDF de todas"
                />
              </p>
            )}
            <ul>
              {children.map((child) => (
                <li key={child.id}>
                  <OpenButton
                    id={child.id}
                    code={child.short_code}
                    onOpen={onOpen}
                  />
                  {child.position && h.kind === 'portioning'
                    ? ` porção ${child.position}`
                    : ''}{' '}
                  — {voided ? 0 : child.balance} {unit}
                  {voided && ' (zerado pela anulação)'}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
