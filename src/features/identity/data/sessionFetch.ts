// V2 (D-025): a API responde 401 com código SESSION_EXPIRED quando o banco considera a sessão
// expirada ou encerrada (session_guard.check_request). Este fetch avisa o aplicativo, que sai da conta.

export const SESSION_EXPIRED_CODE = 'SESSION_EXPIRED';

// O token da requisição recusada vai junto: uma resposta atrasada de quem já saiu não pode encerrar a
// sessão de quem entrou depois no mesmo aparelho.
function bearer(input: RequestInfo | URL, init?: RequestInit): string | null {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  const value = headers.get('Authorization');
  return value?.startsWith('Bearer ') ? value.slice('Bearer '.length) : null;
}

export function createSessionFetch(
  base: typeof fetch = (...args) => fetch(...args),
) {
  const listeners = new Set<(token: string | null) => void>();
  const sessionFetch: typeof fetch = async (input, init) => {
    const response = await base(input, init);
    if (response.status === 401 && listeners.size > 0) {
      try {
        const body: unknown = await response.clone().json();
        if (
          typeof body === 'object' &&
          body !== null &&
          (body as { code?: unknown }).code === SESSION_EXPIRED_CODE
        )
          for (const listener of [...listeners]) listener(bearer(input, init));
      } catch {
        // Corpo que não é JSON: não é a recusa de sessão.
      }
    }
    return response;
  };
  return {
    fetch: sessionFetch,
    onExpired(listener: (token: string | null) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type SessionEvents = ReturnType<typeof createSessionFetch>;
