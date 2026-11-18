import { ACTIVITY_KEY, parseActivity } from '../domain/session';

export interface ActivityStore {
  read(): number | null;
  write(at: number): void;
  clear(): void;
}

/** Última atividade no navegador, compartilhada entre as abas (localStorage). */
export function createActivityStore(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
): ActivityStore {
  // Sem armazenamento, vale só a aba atual.
  let memory: number | null = null;
  return {
    read() {
      try {
        if (storage) return parseActivity(storage.getItem(ACTIVITY_KEY));
      } catch {
        // Armazenamento bloqueado: usa a memória da aba.
      }
      return memory;
    },
    write(at) {
      memory = at;
      try {
        storage?.setItem(ACTIVITY_KEY, String(at));
      } catch {
        // Idem.
      }
    },
    clear() {
      memory = null;
      try {
        storage?.removeItem(ACTIVITY_KEY);
      } catch {
        // Idem.
      }
    },
  };
}

export function defaultActivityStore(): ActivityStore {
  try {
    return createActivityStore(
      typeof window === 'undefined' ? null : window.localStorage,
    );
  } catch {
    return createActivityStore(null);
  }
}
