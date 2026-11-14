import type { SupabaseClient } from '@supabase/supabase-js';
import type { IdentityGateway } from '../application/identityGateway';
import {
  accessSchema,
  credentials,
  organizationName,
} from '../domain/identity';

export function createIdentityGateway(client: SupabaseClient): IdentityGateway {
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
      const { data, error } = await client.auth.signInWithPassword(input);
      if (error || !data.user)
        throw new Error(
          'Não foi possível entrar. Confira os dados e a conexão.',
        );
      return data.user.id;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error)
        throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
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
      const { data } = client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') callback();
      });
      return () => data.subscription.unsubscribe();
    },
  };
}
