import type { CatalogScope } from '../../catalog/domain/catalog';
export class MovementRejected extends Error {}
// Fatia 6.5b: recusa por bloqueio (ocorrência sem decisão ou rejeitada); a mensagem vem do banco.
export class MovementBlocked extends MovementRejected {}
// D-073 (etapa 2): recusa porque a quantidade passa do saldo registrado do recipiente.
export class MovementOverBalance extends MovementRejected {}
export type MovementInput = {
  batchId: string;
  // D-073 (etapa 2): sem containerId, a saída vai para o integral do recebimento (record_movement);
  // com ele, para esse recipiente, inclusive porção ou derivado (record_container_movement).
  containerId?: string;
  kind: 'consumption' | 'discard' | 'reversal';
  quantity: string;
  reason: string | null;
  intentId: string;
  targetId?: string;
};
export type Movement = {
  id: string;
  // 'transfer' (fatia 6.3): saída para recipientes derivados; só é desfeita pela anulação da
  // manipulação (6.4), nunca por "Anular registro".
  // 'transfer_reversal' (fatia 6.4): devolução da transferência quando a manipulação é anulada;
  // 'handling_void' (6.4) só aparece nos derivados e zera o saldo deles.
  kind:
    | 'consumption'
    | 'discard'
    | 'reversal'
    | 'transfer'
    | 'transfer_reversal'
    | 'handling_void'
    // 'production_void' (fatia 7.2): anulação de produção; zera o integral e não é desfeita.
    | 'production_void';
  quantity: number;
  reason: string | null;
  created_by: string;
  created_at: string;
  timezone: string;
  reverses_id?: string | null;
  // Manipulação que gerou o movimento (transferência ou descarte de sobra).
  handlingId?: string | null;
};
export interface MovementGateway {
  // Sem containerId, o histórico do integral do recebimento; com ele, o desse recipiente.
  list(
    scope: CatalogScope,
    batchId: string,
    containerId?: string,
  ): Promise<Movement[]>;
  record(scope: CatalogScope, input: MovementInput): Promise<string>;
}
