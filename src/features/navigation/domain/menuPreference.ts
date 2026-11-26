// PR-13: lembra, neste aparelho e por pessoa, se o menu lateral foi recolhido ou expandido. É só
// conveniência de leitura: nunca decide permissão e a tela funciona igual sem ela (armazenamento
// bloqueado, janela privada, dado ilegível).
const PREFIX = 'cozzigo.menu-recolhido.';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** `true` recolhido, `false` expandido, `null` sem escolha (vale o padrão da largura da tela). */
export function readMenuCollapsed(person: string | undefined): boolean | null {
  if (!person) return null;
  try {
    const value = storage()?.getItem(PREFIX + person);
    return value === '1' ? true : value === '0' ? false : null;
  } catch {
    return null;
  }
}

export function writeMenuCollapsed(
  person: string | undefined,
  collapsed: boolean,
): void {
  if (!person) return;
  try {
    storage()?.setItem(PREFIX + person, collapsed ? '1' : '0');
  } catch {
    // Sem armazenamento: a escolha vale só nesta sessão da tela.
  }
}
