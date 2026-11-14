import { z } from 'zod';

// Tentativa pendente (desenho 4.7): operação de escrita cujo resultado ficou incerto. Guarda só o
// necessário para conferir no servidor (identificador) e, se o servidor não a tem, enviar de novo com
// o mesmo identificador. Fica no localStorage do navegador, por usuário, por até 24 horas; nunca guarda
// senha, sessão ou chave.
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
export const PENDING_LIMIT = 20;

export const pendingKinds = [
  'receipt',
  'handling',
  'void',
  'decision',
  'movement',
  'location_move',
  'location',
] as const;
export type PendingKind = (typeof pendingKinds)[number];

export const pendingSchema = z.object({
  intentId: z.uuid(),
  kind: z.enum(pendingKinds),
  organizationId: z.uuid(),
  establishmentId: z.uuid(),
  createdAt: z.number().int().positive(),
  summary: z.string().max(200),
  input: z.record(z.string(), z.unknown()),
});
export type PendingAttempt = z.infer<typeof pendingSchema>;

export const kindLabels: Record<PendingKind, string> = {
  receipt: 'Recebimento',
  handling: 'Abertura ou porcionamento',
  void: 'Anulação de manipulação',
  decision: 'Decisão de ocorrência',
  movement: 'Saída ou anulação de saída',
  location_move: 'Mudança de local',
  location: 'Local de armazenamento',
};

const key = (userId: string) => `pending-attempts:v1:${userId}`;
type Listener = () => void;
const listeners = new Set<Listener>();

function read(userId: string, now: number): PendingAttempt[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      const parsed = pendingSchema.safeParse(item);
      return parsed.success && now - parsed.data.createdAt < PENDING_TTL_MS
        ? [parsed.data]
        : [];
    });
  } catch {
    return [];
  }
}
function write(userId: string, list: PendingAttempt[]) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(list));
  } catch {
    /* sem localStorage: a conferência só vale nesta sessão */
  }
  for (const listener of listeners) listener();
}

export const pendingStore = {
  list(userId: string, now = Date.now()): PendingAttempt[] {
    return read(userId, now);
  },
  add(userId: string, attempt: PendingAttempt, now = Date.now()) {
    const rest = read(userId, now).filter(
      (item) => item.intentId !== attempt.intentId,
    );
    write(userId, [...rest, attempt].slice(-PENDING_LIMIT));
  },
  remove(userId: string, intentId: string, now = Date.now()) {
    const list = read(userId, now);
    const rest = list.filter((item) => item.intentId !== intentId);
    if (rest.length !== list.length) write(userId, rest);
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    window.addEventListener('storage', listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', listener);
    };
  },
};
