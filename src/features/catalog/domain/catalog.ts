import { z } from 'zod';

export const units = ['kg', 'g', 'l', 'ml', 'un'] as const;
const unitSchema = z.enum(units);
const nameSchema = z.string().trim().min(1).max(120);
// Fatia 7.3: preparações próprias (D-049, D-050) ficam na tabela de produtos, com `kind = 'preparation'`.
export type CatalogKind = 'products' | 'suppliers' | 'preparations';
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
  // Fatia 7.7: janela de registro da produção própria da preparação (nulo = a da unidade).
  production_window_minutes: z.number().int().nullable().optional(),
});
export type CatalogItem = CatalogInput & {
  id: string;
  storage_condition?: StorageCondition | null;
  production_window_minutes?: number | null;
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
