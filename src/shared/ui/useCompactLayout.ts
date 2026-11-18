import { useEffect, useState } from 'react';

// V4 (item 7): mesma largura em que o menu da unidade vira barra inferior (styles.css, 899 px).
export const COMPACT_QUERY = '(max-width: 899px)';

function matches(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(COMPACT_QUERY).matches
  );
}

/**
 * Diz se a tela é de celular. Só muda a arrumação dos botões; nenhuma ação deixa de existir. Sem
 * `matchMedia` (ambiente de teste), vale o desktop.
 */
export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return compact;
}
