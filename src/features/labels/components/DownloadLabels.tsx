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
  onDownloaded,
}: {
  gateway: LabelGateway;
  ids: string[];
  filename: string;
  label: string;
  // Fatia 7.8: chamado só depois que o PDF foi gerado e baixado.
  onDownloaded?: () => void;
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
      onDownloaded?.();
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
