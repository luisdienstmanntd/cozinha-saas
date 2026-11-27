import { z } from 'zod';

export const units = ['kg', 'g', 'l', 'ml', 'un'] as const;
const unitSchema = z.enum(units);
const nameSchema = z.string().trim().min(1).max(120);
// Fatia 7.3: preparações próprias (D-049, D-050) ficam na tabela de produtos, com `kind = 'preparation'`.
export type CatalogKind = 'products' | 'suppliers' | 'preparations';
export type CatalogScope = { organizationId: string; establishmentId: string };
export type CatalogInput = {
  name: string;
  unit?: (typeof units)[number];
  email?: string | null;
  contact?: string | null;
};
export const catalogRow = z.object({ id: z.uuid(), name: nameSchema });
export const supplierRow = catalogRow.extend({
  // Leitura tolera todos os endereços aceitos pelo banco; entrada é validada estritamente.
  email: z.string().min(3).max(254).nullable().optional(),
  contact: z.string().min(1).max(80).nullable().optional(),
});
function optionalContact(value: unknown, email: boolean): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error('Informe um contato válido.');
  const text = value.trim();
  if (!text) return null;
  const valid = email
    ? z.email().max(254).safeParse(text).success
    : text.length <= 80;
  if (!valid)
    throw new Error(
      email
        ? 'Informe um e-mail válido com até 254 caracteres.'
        : 'O contato deve ter até 80 caracteres.',
    );
  return text;
}
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
  email?: unknown,
  contact?: unknown,
): CatalogInput {
  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success)
    throw new Error('Informe um nome de 1 a 120 caracteres.');
  if (kind === 'suppliers')
    return {
      name: parsedName.data,
      email: optionalContact(email, true),
      contact: optionalContact(contact, false),
    };
  const parsedUnit = unitSchema.safeParse(unit);
  if (!parsedUnit.success) throw new Error('Selecione a unidade de medida.');
  return { name: parsedName.data, unit: parsedUnit.data };
}
