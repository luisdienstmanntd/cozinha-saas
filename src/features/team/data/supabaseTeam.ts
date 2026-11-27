import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { TeamRejected, type TeamGateway } from '../application/teamGateway';
import {
  DISPLAY_NAME_MAX,
  ROLES,
  addMemberInputSchema,
  teamErrorMessage,
  teamMemberSchema,
} from '../domain/team';

export function createTeamGateway(client: SupabaseClient): TeamGateway {
  const refuse = (error: { code?: string; message?: string }) =>
    new TeamRejected(teamErrorMessage(error));
  const ids = (organizationId: string, userId: string) => ({
    p_organization_id: z.uuid().parse(organizationId),
    p_user_id: z.uuid().parse(userId),
  });
  return {
    async list(organizationId) {
      const { data, error } = await client.rpc('list_team_members', {
        p_organization_id: z.uuid().parse(organizationId),
      });
      if (error) throw new Error('Não foi possível carregar a equipe.');
      return teamMemberSchema.array().parse(data);
    },
    async add(organizationId, input) {
      const v = addMemberInputSchema.parse(input);
      const { data, error } = await client.rpc('add_team_member', {
        p_organization_id: z.uuid().parse(organizationId),
        p_email: v.email,
        p_display_name: v.displayName,
        p_role: v.role,
      });
      if (error) throw refuse(error);
      return z.uuid().parse(data);
    },
    async setRole(organizationId, userId, role) {
      const { data, error } = await client.rpc('set_team_member_role', {
        ...ids(organizationId, userId),
        p_role: z.enum(ROLES).parse(role),
      });
      if (error) throw refuse(error);
      return z.enum(ROLES).parse(data);
    },
    async rename(organizationId, userId, name) {
      const { data, error } = await client.rpc('set_member_display_name', {
        ...ids(organizationId, userId),
        p_display_name: z
          .string()
          .trim()
          .min(1)
          .max(DISPLAY_NAME_MAX)
          .parse(name),
      });
      if (error)
        throw new TeamRejected(
          error.code === '42501'
            ? teamErrorMessage(error)
            : 'Não foi possível salvar o nome. Confira e tente de novo.',
        );
      return z.string().parse(data);
    },
    async revoke(organizationId, userId) {
      const { error } = await client.rpc(
        'revoke_team_member',
        ids(organizationId, userId),
      );
      if (error) throw refuse(error);
    },
    async restore(organizationId, userId) {
      const { error } = await client.rpc(
        'restore_team_member',
        ids(organizationId, userId),
      );
      if (error) throw refuse(error);
    },
  };
}
