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

// PR-13: tablet deitado (900 a 1199 px). Aqui o menu lateral começa recolhido para sobrar largura ao
// conteúdo; a pessoa pode expandir e a escolha fica lembrada (só conveniência de leitura).
export const TABLET_QUERY = '(min-width: 900px) and (max-width: 1199px)';

function tabletMatches(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(TABLET_QUERY).matches
  );
}

/** Diz se a tela é de tablet deitado. Sem `matchMedia` (ambiente de teste), vale o desktop. */
export function useTabletLayout(): boolean {
  const [tablet, setTablet] = useState(tabletMatches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(TABLET_QUERY);
    const update = () => setTablet(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return tablet;
}
