import { z } from 'zod';
import { storageConditionSchema } from '../../catalog/domain/catalog';

// Locais de armazenamento e mudança de local (D-030, fatia 6.9). Mudar de local não altera saldo,
// validade nem conservação. Tudo vem do banco pela RLS; aqui só forma e mensagens.
export const NAME_MAX = 40;

export const locationSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  condition: storageConditionSchema,
  active: z.boolean(),
});
export type StorageLocation = z.infer<typeof locationSchema>;

export const currentLocationSchema = z.object({
  container_id: z.uuid(),
  location_id: z.uuid(),
  location_name: z.string(),
  location_condition: storageConditionSchema,
  moved_at: z.string(),
  handled_by_name: z.string(),
  mismatch_confirmed: z.boolean(),
});
export type CurrentLocation = z.infer<typeof currentLocationSchema>;

export const createLocationInputSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  condition: storageConditionSchema,
  intentId: z.uuid(),
});
export type CreateLocationInput = z.infer<typeof createLocationInputSchema>;

export const moveInputSchema = z.object({
  containerId: z.uuid(),
  locationId: z.uuid(),
  handledBy: z.uuid(),
  confirmMismatch: z.boolean(),
  intentId: z.uuid(),
});
export type MoveInput = z.infer<typeof moveInputSchema>;

// Recusa do banco que pede confirmação (não é erro: a tela oferece "Registrar mesmo assim").
export const MISMATCH_MESSAGE =
  'A condição do local é diferente da condição do recipiente; confirme para registrar.';

// Mensagens de recusa que a tela repete. Lista exata; um teste confere que cada uma existe nas migrações.
export const LOCATION_MESSAGES = [
  MISMATCH_MESSAGE,
  'Local desativado; escolha outro local.',
  'O recipiente já está neste local.',
  'Recipiente sem saldo; não é possível mudar de local.',
  'A pessoa que mudou o recipiente de local precisa ter vínculo ativo com a empresa.',
  'Defina o nome de exibição da pessoa antes de registrar.',
  'Já existe um local com esse nome nesta unidade.',
  'Recipiente bloqueado: ocorrência aguardando decisão do proprietário. Só o descarte é permitido.',
  'Recipiente bloqueado: ocorrência rejeitada pelo proprietário. Só o descarte é permitido.',
  'Algum recipiente desta manipulação já mudou de local; a manipulação não pode ser anulada.',
] as const;

export function knownLocationMessage(message: unknown): string | null {
  return typeof message === 'string' &&
    (LOCATION_MESSAGES as readonly string[]).includes(message)
    ? message
    : null;
}

export const MOVE_NOTE =
  'Mudar de local só registra onde o recipiente está. Não altera saldo, validade nem conservação.';
