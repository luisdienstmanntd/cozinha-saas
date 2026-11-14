import { useEffect, useRef, useState } from 'react';
import type { LabelGateway } from '../application/labelGateway';
import { downloadLabels } from '../application/download';

// "Baixar PDF de todas" / "Baixar esta" (desenho 7.2). Recusas (bloqueio por atraso, anulada, dados
// indisponíveis) aparecem ao lado do botão, com a mensagem de quem recusou.
export function DownloadLabels({
  gateway,
  ids,
  filename,
  label,
}: {
  gateway: LabelGateway;
  ids: string[];
  filename: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function run() {
    setBusy(true);
    setError('');
    try {
      await downloadLabels(gateway, ids, filename);
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível gerar as etiquetas.',
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      <button type="button" disabled={busy} onClick={() => void run()}>
        {label}
      </button>
      {error && <span role="alert"> {error}</span>}
    </>
  );
}
