import { useEffect, useId, useState } from 'react';
import { containerPath } from '../domain/label';
import type { LabelData } from '../domain/label';
import { labelContent, validateLabels } from '../application/labelContent';
import type { LabelContent } from '../application/labelContent';
import { labelOrigin } from '../application/labelOrigin';

// Prévia da etiqueta em tela (M9 do diagnóstico de 26/11/2026). Mostra o mesmo texto que o PDF vai
// imprimir (vem de `labelContent.ts`) e passa pelas mesmas recusas, para conferir antes de baixar.
// É só leitura: não grava nada, não baixa nada e não prova impressão. O QR leva a mesma URL do PDF.
type State =
  | { status: 'closed' }
  | { status: 'refused'; message: string }
  | { status: 'ready'; content: LabelContent; qr: string };

function inOrder(content: LabelContent) {
  const [first, ...rest] = content.rows;
  // Mesma ordem de leitura do PDF: no produto aberto o horário de abertura vem antes da validade.
  const before =
    content.model === 'opened' && first?.key === 'openedAt' ? [first] : [];
  const body = content.model === 'opened' ? rest : content.rows;
  return {
    before,
    main: body.filter((row) => !row.side),
    side: body.filter((row) => row.side),
  };
}

export function LabelPreview({ data }: { data: LabelData }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: 'closed' });
  const headingId = useId();
  useEffect(() => {
    if (!open) return;
    let current = true;
    void (async () => {
      try {
        const url = validateLabels([data], labelOrigin());
        const content = labelContent(data);
        const { default: QRCode } = await import('qrcode');
        const qr = await QRCode.toDataURL(
          `${url.origin}${containerPath(data.id)}`,
          { errorCorrectionLevel: 'M', margin: 2, width: 300 },
        );
        if (current) setState({ status: 'ready', content, qr });
      } catch (cause) {
        if (current)
          setState({
            status: 'refused',
            message:
              cause instanceof Error
                ? cause.message
                : 'Não foi possível montar a prévia.',
          });
      }
    })();
    return () => {
      current = false;
    };
  }, [open, data]);
  const shown = open ? state : ({ status: 'closed' } as State);
  return (
    <div className="label-preview">
      <button
        type="button"
        className="secondary"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setState({ status: 'closed' });
        }}
      >
        {open ? 'Fechar prévia' : 'Ver prévia da etiqueta'}
      </button>
      {shown.status === 'refused' && <p role="alert">{shown.message}</p>}
      {shown.status === 'ready' && (
        <section aria-labelledby={headingId}>
          <h3 id={headingId}>Prévia da etiqueta</h3>
          <p className="label-preview-note">
            Prévia na tela, só para conferir. Baixar o PDF não comprova
            impressão nem aplicação da etiqueta.
          </p>
          <Sheet content={shown.content} qr={shown.qr} />
        </section>
      )}
    </div>
  );
}

function Sheet({ content, qr }: { content: LabelContent; qr: string }) {
  const { before, main, side } = inOrder(content);
  return (
    <div
      className="label-sheet"
      role="group"
      aria-label={`Etiqueta ${content.shortCode}, modelo ${content.title}`}
    >
      <p className="label-sheet-title">{content.title}</p>
      <p className="label-sheet-name">{content.name}</p>
      {before.map((row) => (
        <p key={row.key}>{row.text}</p>
      ))}
      {content.validity && (
        <div className="label-sheet-validity">
          <span>{content.validity.caption}</span>
          <strong>{content.validity.date}</strong>
          <small>{content.validity.note}</small>
        </div>
      )}
      {main.map((row) => (
        <p key={row.key}>{row.text}</p>
      ))}
      <div className="label-sheet-bottom">
        <div>
          {side.map((row) => (
            <p key={row.key}>{row.text}</p>
          ))}
          {content.hold && (
            <p className="label-sheet-hold">
              {content.hold.first} {content.hold.second}
            </p>
          )}
          <p className="label-sheet-code">{content.shortCode}</p>
          <p className="label-sheet-id">ID: {content.id}</p>
        </div>
        <img src={qr} alt="QR do recipiente (mesmo endereço do PDF)" />
      </div>
    </div>
  );
}
