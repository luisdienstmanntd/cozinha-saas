// Fatia 7.1 (D-049): lote produzido pela cozinha não tem lote do fabricante. Até a tela própria (7.3),
// as telas atuais mostram "preparação própria" no lugar do código do lote.
export const PRODUCED_LOT = 'preparação própria';

export function lotText(
  sourceCode: string | null,
  capitalized = false,
): string {
  const text = sourceCode === null ? PRODUCED_LOT : `lote ${sourceCode}`;
  return capitalized ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
