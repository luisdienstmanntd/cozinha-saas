import type { LabelGateway } from './labelGateway';

// Baixa um PDF com uma etiqueta por página (desenho 7.2, "Baixar PDF de todas"). Cada recipiente é
// relido e reautorizado no momento de gerar; reimpressão nunca grava nada (D-003). O gerador é
// carregado só quando alguém pede a etiqueta.
export async function downloadLabels(
  gateway: LabelGateway,
  ids: string[],
  filename: string,
): Promise<void> {
  const list = await Promise.all(ids.map((id) => gateway.get(id)));
  const { makeLabelsPdf } = await import('./pdf');
  const blob = await makeLabelsPdf(list, window.location.origin);
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
