import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IdentityGateway,
  SignOutReason,
} from '../application/identityGateway';
import type { SessionEvents } from './sessionFetch';
import {
  accessSchema,
  credentials,
  organizationName,
} from '../domain/identity';

/** Chave da sessão no armazenamento do navegador (V2, D-025). */
export const AUTH_STORAGE_KEY = 'cozinha-saas.auth';

export function createIdentityGateway(
  client: SupabaseClient,
  session?: {
    events: SessionEvents;
    storage: Pick<Storage, 'removeItem'> | null;
  },
): IdentityGateway {
  let reason: SignOutReason = 'signed_out';
  let ending: Promise<void> | null = null;
  const listeners = new Set<(reason?: SignOutReason) => void>();
  function notify() {
    for (const listener of [...listeners]) listener(reason);
  }
  // Sair só desta sessão (scope local): a linha de auth.sessions é apagada e o token deixa de valer
  // no banco na hora. Se o servidor não responder, a sessão sai deste navegador mesmo assim; no banco
  // ela expira pela inatividade.
  async function end(why: SignOutReason) {
    if (ending) return ending;
    reason = why;
    ending = (async () => {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (!error) return;
      try {
        session?.storage?.removeItem(AUTH_STORAGE_KEY);
      } catch {
        // Armazenamento indisponível: nada guardado para retirar.
      }
      notify();
      throw new Error(
        'A sessão saiu deste aparelho, mas o servidor não confirmou. Sem uso, ela expira em até 30 minutos.',
      );
    })().finally(() => {
      ending = null;
    });
    return ending;
  }
  session?.events.onExpired(() => {
    void end('expired').catch(() => {});
  });
  async function loadReport() {
    const { data, error } = await client
      .from('organizations')
      .select(
        'id,name,establishments(id,name,timezone),memberships(user_id,role)',
      );
    if (error)
      throw new Error(
        'Não foi possível consultar o acesso. Confira a sessão e a conexão.',
      );
    // Uma empresa com dado inesperado não esconde as outras (P7): cada uma é validada separadamente.
    const rows = Array.isArray(data) ? data : [];
    const valid = rows.flatMap((row) => {
      const parsed = accessSchema.element.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
    if (!Array.isArray(data))
      throw new Error(
        'Não foi possível consultar o acesso. Confira a sessão e a conexão.',
      );
    return { access: valid, skipped: rows.length - valid.length };
  }
  return {
    async signIn(email, password) {
      const input = credentials.parse({ email, password });
      reason = 'signed_out';
      const { data, error } = await client.auth.signInWithPassword(input);
      if (error || !data.user)
        throw new Error(
          'Não foi possível entrar. Confira os dados e a conexão.',
        );
      return data.user.id;
    },
    async signOut() {
      await end('signed_out');
    },
    async expire() {
      await end('expired');
    },
    async currentUser() {
      const { data, error } = await client.auth.getSession();
      const user = data.session?.user;
      if (error || !user) return null;
      return { id: user.id, email: user.email ?? null };
    },
    async touch() {
      const { error, status } = await client.rpc('touch_session');
      if (!error) return 'ok';
      if (status === 401 || error.code === 'SESSION_EXPIRED') return 'expired';
      if (error.code === '28000') return 'expired';
      throw new Error(
        'Não foi possível confirmar a sessão. Confira a conexão e tente novamente.',
      );
    },
    loadReport,
    async load() {
      return (await loadReport()).access;
    },
    async rename(organizationId, name) {
      const { data, error } = await client
        .from('organizations')
        .update({ name: organizationName.parse(name) })
        .eq('id', organizationId)
        .select('id');
      if (error || data?.length !== 1)
        throw new Error(
          'Alteração recusada. Atualize o acesso e confira sua permissão.',
        );
    },
    onSignOut(callback) {
      listeners.add(callback);
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event !== 'SIGNED_OUT') return;
        callback(reason);
      });
      return () => {
        listeners.delete(callback);
        data.subscription.unsubscribe();
      };
    },
  };
}
