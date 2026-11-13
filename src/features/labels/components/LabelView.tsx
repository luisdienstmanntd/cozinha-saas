import { useEffect, useRef, useState } from 'react';
import type { LabelGateway } from '../application/labelGateway';
import type { LabelData } from '../domain/label';
import { LATE_HOLD_MESSAGE } from '../domain/label';
import { makeLabelPdf } from '../application/pdf';

export function LabelView({
  id,
  gateway,
}: {
  id: string;
  gateway: LabelGateway;
}) {
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
  }, [gateway, id]);
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
          <p>Um recipiente integral corresponde a este recebimento.</p>
          <p>
            {data.batch_receipts.products.name} — lote{' '}
            {data.batch_receipts.source_code}
          </p>
          <p>
            Quantidade inicial: {data.batch_receipts.quantity}{' '}
            {data.batch_receipts.unit} — validade{' '}
            {data.batch_receipts.expiry_date} (
            {data.batch_receipts.expiry_origin === 'original'
              ? 'original'
              : 'definida pelo responsável'}
            )
          </p>
          <p>
            Saldo atual: {data.balance} {data.batch_receipts.unit}
            {data.balance <= 0 && ' — esgotado, sem saldo neste recipiente'}
          </p>
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
        </>
      )}
    </section>
  );
}
