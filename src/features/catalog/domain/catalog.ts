import { z } from 'zod';

export const units = ['kg', 'g', 'l', 'ml', 'un'] as const;
const unitSchema = z.enum(units);
const nameSchema = z.string().trim().min(1).max(120);
export type CatalogKind = 'products' | 'suppliers';
export type CatalogScope = { organizationId: string; establishmentId: string };
export type CatalogInput = { name: string; unit?: (typeof units)[number] };
export const catalogRow = z.object({ id: z.uuid(), name: nameSchema });
// Fatia 6.5a/6.5b: conservação definida uma vez pelo proprietário (auditada no banco; não muda depois).
export const storageConditions = ['ambient', 'refrigerated', 'frozen'] as const;
export type StorageCondition = (typeof storageConditions)[number];
export const storageConditionSchema = z.enum(storageConditions);
export const storageLabels: Record<StorageCondition, string> = {
  ambient: 'Ambiente',
  refrigerated: 'Refrigerado',
  frozen: 'Congelado',
};
export const productRow = catalogRow.extend({
  unit: unitSchema,
  storage_condition: storageConditionSchema.nullable(),
});
export type CatalogItem = CatalogInput & {
  id: string;
  storage_condition?: StorageCondition | null;
};

export function parseStorageCondition(value: unknown): StorageCondition {
  const parsed = storageConditionSchema.safeParse(value);
  if (!parsed.success) throw new Error('Selecione a conservação do produto.');
  return parsed.data;
}

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
