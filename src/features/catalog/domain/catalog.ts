import { z } from 'zod';

export const units = ['kg', 'g', 'l', 'ml', 'un'] as const;
const unitSchema = z.enum(units);
const nameSchema = z.string().trim().min(1).max(120);
export type CatalogKind = 'products' | 'suppliers';
export type CatalogScope = { organizationId: string; establishmentId: string };
export type CatalogInput = { name: string; unit?: (typeof units)[number] };
export const catalogRow = z.object({ id: z.uuid(), name: nameSchema });
export const productRow = catalogRow.extend({ unit: unitSchema });
export type CatalogItem = CatalogInput & { id: string };

export function parseCatalogInput(
  kind: CatalogKind,
  name: unknown,
  unit: unknown,
): CatalogInput {
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success)
    throw new Error('Informe um nome de 1 a 120 caracteres.');
  if (kind === 'suppliers') return { name: parsedName.data };
  const parsedUnit = unitSchema.safeParse(unit);
  if (!parsedUnit.success) throw new Error('Selecione a unidade de medida.');
  return { name: parsedName.data, unit: parsedUnit.data };
}
