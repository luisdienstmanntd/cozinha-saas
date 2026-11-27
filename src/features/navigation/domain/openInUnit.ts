import type { MouseEvent } from 'react';

/**
 * PR-11: clique simples abre a ficha dentro da unidade (sem recarregar a página). Ctrl/Cmd/Shift,
 * botão do meio e a falta de manipulador deixam o link agir como link comum, para abrir em outra aba.
 */
export function openInUnit(
  event: MouseEvent<HTMLAnchorElement>,
  open: ((containerId: string) => void) | undefined,
  containerId: string,
) {
  if (
    !open ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  open(containerId);
}
