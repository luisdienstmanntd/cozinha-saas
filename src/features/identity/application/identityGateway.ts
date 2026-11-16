import type { Access } from '../domain/identity';

/** Por que a sessão terminou: Sair, inatividade/recusa do servidor. */
export type SignOutReason = 'signed_out' | 'expired';

export interface IdentityGateway {
  signIn(email: string, password: string): Promise<string>;
  signOut(): Promise<void>;
  load(): Promise<Access>;
  // P7 (fatia 6.8): cada empresa é validada à parte; as válidas aparecem e `skipped` conta as ignoradas.
  loadReport?(): Promise<{ access: Access; skipped: number }>;
  rename(organizationId: string, name: string): Promise<void>;
  onSignOut(callback: (reason?: SignOutReason) => void): () => void;
  // V2 (D-025): sessão guardada no navegador. Sem estes métodos, a tela funciona como antes
  // (entrar a cada carregamento).
  /** Usuário da sessão guardada neste navegador, sem consultar o servidor. */
  currentUser?(): Promise<{ id: string; email: string | null } | null>;
  /** Registra atividade no servidor; 'expired' quando o banco recusa a sessão. */
  touch?(): Promise<'ok' | 'expired'>;
  /** Encerra a sessão por inatividade (o aviso diz o motivo). */
  expire?(): Promise<void>;
}
