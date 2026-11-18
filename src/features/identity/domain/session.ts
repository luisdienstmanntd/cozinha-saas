// V2 (D-025): regras puras da sessão persistente. O banco faz a mesma conta e é quem decide;
// o navegador só encerra antes para a tela não ficar aberta com dados de quem saiu.

/** Inatividade máxima definida por luis em 16/11/2026. Igual a private.session_inactivity_limit(). */
export const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
/** Intervalo mínimo entre dois avisos de atividade ao servidor. */
export const TOUCH_INTERVAL_MS = 60 * 1000;
/** Intervalo da conferência periódica do relógio de inatividade. */
export const CHECK_INTERVAL_MS = 15 * 1000;
/** Chave da última atividade no navegador (compartilhada entre abas, sem dado pessoal). */
export const ACTIVITY_KEY = 'cozinha-saas.last-activity';

export const EXPIRED_MESSAGE =
  'Sessão encerrada por inatividade (30 minutos). Entre novamente.';
export const SIGNED_OUT_MESSAGE = 'Sessão encerrada. Entre novamente.';

export function parseActivity(value: string | null): number | null {
  if (value === null || !/^\d{1,16}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Sessão sem registro de atividade no navegador conta como expirada: não há como saber quanto
 * tempo o aparelho ficou parado. Atividade "no futuro" (relógio alterado) também.
 */
export function isIdle(lastActivity: number | null, now: number): boolean {
  if (lastActivity === null) return true;
  if (lastActivity > now + TOUCH_INTERVAL_MS) return true;
  return now - lastActivity >= INACTIVITY_LIMIT_MS;
}

export function shouldTouch(lastTouch: number | null, now: number): boolean {
  return lastTouch === null || now - lastTouch >= TOUCH_INTERVAL_MS;
}
