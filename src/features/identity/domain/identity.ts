import { z } from 'zod';

export const organizationName = z.string().trim().min(1).max(120);
export const credentials = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export const accessSchema = z.array(
  z.object({
    id: z.uuid(),
    name: organizationName,
    establishments: z.array(
      z.object({
        id: z.uuid(),
        name: organizationName,
        timezone: z.string().min(1),
      }),
    ),
    memberships: z.array(
      z.object({
        user_id: z.uuid(),
        role: z.enum(['owner', 'member']),
      }),
    ),
  }),
);
export type Access = z.infer<typeof accessSchema>;
