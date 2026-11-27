import { z } from 'zod';

// D-077: equipe da empresa. Só apresentação e validação de fronteira; quem decide é o banco
// (list/add/set_role/revoke/restore_team_member, só proprietário ativo, nunca sem proprietário).

export const ROLES = ['owner', 'member'] as const;
export type Role = (typeof ROLES)[number];
export const roleLabels: Record<Role, string> = {
  owner: 'Proprietário',
  member: 'Colaborador',
};
export const roleHints: Record<Role, string> = {
  owner: 'Gerencia cadastros, equipe e todas as operações.',
  member: 'Consulta a unidade e registra a produção quando permitido.',
};

export const DISPLAY_NAME_MAX = 40;
export const EMAIL_MAX = 254;

export const teamMemberSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string().nullable(),
  email: z.string().nullable(),
  role: z.enum(ROLES),
  created_at: z.string(),
  revoked_at: z.string().nullable(),
  is_self: z.boolean(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const addMemberInputSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(EMAIL_MAX).includes('@'),
  displayName: z.string().trim().min(1).max(DISPLAY_NAME_MAX),
  role: z.enum(ROLES),
});
export type AddMemberInput = z.input<typeof addMemberInputSchema>;

// Mensagens do banco que podem aparecer como estão (texto da migração 20261126000000).
export const TEAM_MESSAGES = [
  'Informe um e-mail válido.',
  'Nome de exibição: de 1 a 40 caracteres.',
  'Escolha o papel: proprietário ou colaborador.',
  'Esta pessoa já faz parte da equipe.',
  'Esta pessoa teve o acesso revogado. Use "Restaurar acesso" na lista da equipe.',
  'Não foi possível vincular este e-mail. Confira se a conta foi criada e confirmada e se ela não está em uso em outra empresa.',
  'Você não pode alterar o próprio papel. Peça a outro proprietário.',
  'Você não pode revogar o próprio acesso. Peça a outro proprietário.',
  'A empresa precisa de pelo menos um proprietário ativo.',
  'Pessoa não encontrada na equipe.',
  'Não foi possível restaurar este acesso. A conta pode ter sido removida ou estar em uso em outra empresa.',
] as const;

export const ACCESS_DENIED =
  'Você não tem permissão para gerenciar a equipe. Atualize a página.';
export const GENERIC_FAILURE = 'Não foi possível concluir. Tente de novo.';

export function teamErrorMessage(error: {
  code?: string;
  message?: string;
}): string {
  if (
    typeof error.message === 'string' &&
    (TEAM_MESSAGES as readonly string[]).includes(error.message)
  )
    return error.message;
  if (error.code === '42501') return ACCESS_DENIED;
  return GENERIC_FAILURE;
}

export function memberName(member: TeamMember): string {
  return member.display_name ?? member.email ?? 'Pessoa sem nome';
}

export function splitTeam(members: readonly TeamMember[]) {
  return {
    active: members.filter((m) => m.revoked_at === null),
    revoked: members.filter((m) => m.revoked_at !== null),
  };
}
