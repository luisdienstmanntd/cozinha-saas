import type { AddMemberInput, Role, TeamMember } from '../domain/team';

// Recusa do banco com mensagem já pronta para a tela (lista fechada em team.ts).
export class TeamRejected extends Error {}

export interface TeamGateway {
  list(organizationId: string): Promise<TeamMember[]>;
  add(organizationId: string, input: AddMemberInput): Promise<string>;
  setRole(organizationId: string, userId: string, role: Role): Promise<Role>;
  rename(organizationId: string, userId: string, name: string): Promise<string>;
  revoke(organizationId: string, userId: string): Promise<void>;
  restore(organizationId: string, userId: string): Promise<void>;
}
