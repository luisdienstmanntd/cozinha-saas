import { useEffect, useRef } from 'react';
import type { ActivityStore } from './sessionActivity';
import { CHECK_INTERVAL_MS, isIdle, shouldTouch } from '../domain/session';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

/**
 * V2 (D-025): enquanto há sessão, conta a inatividade no navegador e avisa o servidor da atividade.
 * Passou de 30 minutos sem toque ou tecla, a sessão é encerrada, mesmo que a aba tenha ficado
 * em segundo plano (a conferência roda de novo ao voltar para a aba). A regra que vale é a do banco;
 * isto só evita a tela aberta com dados depois do prazo.
 */
export function useSessionGuard({
  active,
  store,
  touch,
  expire,
  now = Date.now,
}: {
  active: boolean;
  store: ActivityStore;
  touch?: () => Promise<'ok' | 'expired'>;
  expire: () => void;
  now?: () => number;
}) {
  const lastTouch = useRef<number | null>(null);
  const callbacks = useRef({ touch, expire, now });
  useEffect(() => {
    callbacks.current = { touch, expire, now };
  });
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    lastTouch.current = callbacks.current.now();
    function stop() {
      if (stopped) return;
      stopped = true;
      callbacks.current.expire();
    }
    function check() {
      if (!stopped && isIdle(store.read(), callbacks.current.now())) stop();
    }
    function activity() {
      const at = callbacks.current.now();
      // Toque depois do prazo não reativa a sessão: ela já expirou.
      if (isIdle(store.read(), at)) return stop();
      store.write(at);
      const send = callbacks.current.touch;
      if (!send || !shouldTouch(lastTouch.current, at)) return;
      lastTouch.current = at;
      send().then(
        (result) => {
          if (result === 'expired') stop();
        },
        () => {
          // Falha de conexão: o servidor confere de novo na próxima requisição.
        },
      );
    }
    function visibility() {
      if (document.visibilityState === 'visible') check();
    }
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    for (const name of ACTIVITY_EVENTS)
      window.addEventListener(name, activity, { capture: true, passive: true });
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      for (const name of ACTIVITY_EVENTS)
        window.removeEventListener(name, activity, { capture: true });
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [active, store]);
}
