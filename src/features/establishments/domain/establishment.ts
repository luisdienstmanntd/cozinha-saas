import { z } from 'zod';
import { brazilTimezones } from './timezones';

export const establishmentName = z.string().trim().min(1).max(120);
const timezoneIds = brazilTimezones.map((zone) => zone.id) as [
  string,
  ...string[],
];
export const establishmentTimezone = z.enum(timezoneIds);
export type NewEstablishment = { name: string; timezone: string };

export function parseNewEstablishment(
  name: unknown,
  timezone: unknown,
): NewEstablishment {
  const parsedName = establishmentName.safeParse(name);
  if (!parsedName.success)
    throw new Error('Informe o nome da unidade com 1 a 120 caracteres.');
  const parsedZone = establishmentTimezone.safeParse(timezone);
  if (!parsedZone.success)
    throw new Error('Selecione um fuso horário da lista.');
  return { name: parsedName.data, timezone: parsedZone.data };
}

export function parseEstablishmentName(name: unknown): string {
  const parsed = establishmentName.safeParse(name);
  if (!parsed.success)
    throw new Error('Informe o nome da unidade com 1 a 120 caracteres.');
  return parsed.data;
}

export function timezoneLabel(id: string): string {
  const zone = brazilTimezones.find((item) => item.id === id);
  return zone ? `${zone.label} (${zone.id})` : id;
}

export type MembershipSummary = { owners: number; members: number };
export function summarizeMemberships(
  memberships: ReadonlyArray<{ role: 'owner' | 'member' }>,
): MembershipSummary {
  return {
    owners: memberships.filter((m) => m.role === 'owner').length,
    members: memberships.filter((m) => m.role === 'member').length,
  };
}
