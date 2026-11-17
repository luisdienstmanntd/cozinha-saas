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
  // Fatia 7.4: lote produzido registrado fora da janela, sem liberação do proprietário (ocorrência
  // late_production aberta). A etiqueta não sai, como na manipulação tardia (D-044).
  production_hold: z.boolean().optional(),
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
  // Fatia 6.7: conservação do recipiente e, no derivado, a manipulação que o criou (lida pela RLS).
  storage: z.enum(['ambient', 'refrigerated', 'frozen']).nullable().optional(),
  handling: z
    .object({
      kind: z.enum(['opening', 'portioning']),
      handled_at: z.string(),
      timezone: z.string(),
      handled_by_name: z.string(),
      expiry_date: z.iso.date(),
      storage: z.enum(['ambient', 'refrigerated', 'frozen']),
      position: z.number().int().nullable(),
      siblings: z.number().int().nullable(),
    })
    .optional(),
  // Fatia 7.3: lote produzido pela cozinha (D-050) e, se houver, a anulação dele (D-051), lidos pela RLS.
  production: z
    .object({
      produced_at: z.string(),
      handled_by_name: z.string(),
      timezone: z.string(),
      late: z.boolean(),
      voided: z
        .object({ reason: z.string(), created_at: z.string() })
        .nullable(),
    })
    .optional(),
  batch_receipts: z.object({
    suppliers: z.object({ name: z.string() }).nullable().optional(),
    source_code: z.string().nullable(),
    quantity: z.number(),
    unit: z.string(),
    expiry_date: z.iso.date(),
    expiry_origin: z.enum(['original', 'responsible']),
    // Fatia 6.11: fuso da unidade no recebimento, para a faixa de vencido no QR. Opcional: sem ele a
    // faixa não aparece, e o banco continua recusando o consumo.
    timezone: z.string().optional(),
    products: z.object({ name: z.string() }),
  }),
});
export const PRODUCTION_VOIDED_TEXT = 'ANULADO';
export const PRODUCTION_VOIDED_MESSAGE =
  'Produção anulada: este lote não vale mais e a etiqueta não pode ser gerada. Para corrigir, a produção é registrada de novo.';
// Fatia 7.4: lote produzido (sem lote do fabricante) usa o modelo "Preparação própria"; sem os dados da
// produção, o arquivo é recusado (falha fechada).
export const PRODUCED_LABEL_MESSAGE =
  'Dados da produção indisponíveis: a etiqueta de preparação própria não pode ser gerada.';
export const PRODUCTION_HOLD_MESSAGE =
  'Produção registrada fora da janela de horário, sem liberação do proprietário: a etiqueta não pode ser gerada.';
export const LATE_HOLD_MESSAGE =
  'Manipulação registrada fora da janela de horário, sem liberação do proprietário: a etiqueta não pode ser gerada.';
export const DERIVED_DATA_MESSAGE =
  'Dados da manipulação indisponíveis: a etiqueta de produto aberto não pode ser gerada.';
export type LabelData = z.infer<typeof labelDataSchema>;
export function containerPath(id: string) {
  return `/recipiente/${uuid.parse(id)}`;
}
export function parseContainerPath(path: string) {
  const match = /^\/recipiente\/([^/]+)$/.exec(path);
  const result = uuid.safeParse(match?.[1]);
  return result.success ? result.data : null;
}
