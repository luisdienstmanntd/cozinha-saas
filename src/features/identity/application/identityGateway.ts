import type { Access } from '../domain/identity';

export interface IdentityGateway {
  signIn(email: string, password: string): Promise<string>;
  signOut(): Promise<void>;
  load(): Promise<Access>;
  rename(organizationId: string, name: string): Promise<void>;
  onSignOut(callback: () => void): () => void;
}
