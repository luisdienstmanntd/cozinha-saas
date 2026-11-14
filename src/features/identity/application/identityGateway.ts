import type { Access } from '../domain/identity';

export interface IdentityGateway {
  signIn(email: string, password: string): Promise<string>;
  signOut(): Promise<void>;
  load(): Promise<Access>;
  // P7 (fatia 6.8): cada empresa é validada à parte; as válidas aparecem e `skipped` conta as ignoradas.
  loadReport?(): Promise<{ access: Access; skipped: number }>;
  rename(organizationId: string, name: string): Promise<void>;
  onSignOut(callback: () => void): () => void;
}
