import { z } from 'zod';
import { storageConditionSchema } from '../../catalog/domain/catalog';

// Contexto do formulário e "família" do recipiente na rota do QR (desenho 7.1 e 7.4). Tudo vem do banco
// pela RLS; nada é calculado aqui além de agrupar linhas.
export const contextSchema = z.object({
  container_id: z.uuid(),
  short_code: z.string(),
  kind: z.enum(['integral', 'derived']),
  product_name: z.string().min(1),
  unit: z.string(),
  source_code: z.string(),
  expiry_date: z.iso.date(),
  balance: z.number(),
  timezone: z.string(),
  storage: storageConditionSchema.nullable(),
});
export type HandlingContext = z.infer<typeof contextSchema> & {
  // 'pending' | 'rejected' quando o banco bloqueia a manipulação (container_blocks).
  block: 'pending' | 'rejected' | null;
};

export const memberSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string().nullable(),
  role: z.enum(['owner', 'member']),
});
export type Member = z.infer<typeof memberSchema>;

export const handlingRowSchema = z.object({
  id: z.uuid(),
  source_container_id: z.uuid(),
  kind: z.enum(['opening', 'portioning']),
  expiry_date: z.iso.date(),
  storage: storageConditionSchema,
  handled_at: z.string(),
  handled_by_name: z.string(),
  remainder: z.enum(['none', 'sealed', 'discarded', 'portion']),
  remainder_quantity: z.number(),
  timezone: z.string(),
});
export const voidRowSchema = z.object({
  handling_id: z.uuid(),
  reason: z.string(),
  created_at: z.string(),
});
export const childRowSchema = z.object({
  id: z.uuid(),
  short_code: z.string(),
  handling_id: z.uuid().nullable(),
  position: z.number().nullable(),
  initial_quantity: z.number(),
});

export type ContainerRef = {
  id: string;
  short_code: string;
  position: number | null;
  initial_quantity: number;
  balance: number;
};
export type OpeningInfo = {
  handling: z.infer<typeof handlingRowSchema>;
  voided: { reason: string; created_at: string } | null;
  children: ContainerRef[];
};
export type Family = {
  // Manipulação que criou este recipiente (derivado), com a origem.
  created: {
    handling: z.infer<typeof handlingRowSchema>;
    voided: { reason: string; created_at: string } | null;
    parent: { id: string; short_code: string } | null;
    position: number | null;
    siblings: number;
  } | null;
  // Manipulações feitas a partir deste recipiente.
  openings: OpeningInfo[];
  // Verdadeiro quando o recebimento tem mais recipientes do que a consulta devolve.
  partial: boolean;
};
