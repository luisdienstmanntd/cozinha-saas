import { z } from 'zod';

const uuid = z.uuid();
export const labelDataSchema = z.object({
  id: uuid,
  // Fatia 6.2: código curto e saldo calculado no servidor (list_containers), lidos a cada consulta.
  short_code: z.string().regex(/^C-\d{6,}$/),
  balance: z.number(),
  // Fatia 6.4: recipiente derivado de manipulação anulada. A etiqueta dele é recusada (4.10, teste 9).
  voided: z.boolean().optional(),
  // Fatia 6.5a: derivado de manipulação tardia sem liberação. A etiqueta não sai: não se imprime um
  // horário de abertura que o proprietário ainda não aceitou (4.8, teste 6).
  late_hold: z.boolean().optional(),
  // Fatia 6.5b: recipiente bloqueado por ocorrência (sem decisão ou rejeitada). A etiqueta sai com a
  // faixa de bloqueio; liberada a ocorrência, a reimpressão sai sem a faixa.
  hold: z.enum(['pending', 'rejected']).nullable().optional(),
  // Fatia 6.6: dados do próprio recipiente (list_containers). Opcionais: sem eles vale o recebimento.
  kind: z.enum(['integral', 'derived']).optional(),
  organization_id: uuid.optional(),
  establishment_id: uuid.optional(),
  effective: z
    .object({
      expiry_date: z.iso.date(),
      expiry_origin: z.enum(['receipt', 'handling']),
      initial_quantity: z.number(),
    })
    .optional(),
  batch_receipts: z.object({
    source_code: z.string(),
    quantity: z.number(),
    unit: z.string(),
    expiry_date: z.iso.date(),
    expiry_origin: z.enum(['original', 'responsible']),
    products: z.object({ name: z.string() }),
  }),
});
export const LATE_HOLD_MESSAGE =
  'Manipulação registrada fora da janela de horário, sem liberação do proprietário: a etiqueta não pode ser gerada.';
export const DERIVED_LABEL_MESSAGE =
  'A etiqueta de produto aberto ou fracionado chega na próxima fatia. Até lá, anote o código curto no recipiente.';
export type LabelData = z.infer<typeof labelDataSchema>;
export function containerPath(id: string) {
  return `/recipiente/${uuid.parse(id)}`;
}
export function parseContainerPath(path: string) {
  const match = /^\/recipiente\/([^/]+)$/.exec(path);
  const result = uuid.safeParse(match?.[1]);
  return result.success ? result.data : null;
}
