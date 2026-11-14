import type { BatchGateway } from '../../batches/application/batchGateway';
import { BatchRejected } from '../../batches/application/batchGateway';
import type { CatalogScope } from '../../catalog/domain/catalog';
import type { HandlingGateway } from '../../handling/application/handlingGateway';
import { HandlingRejected } from '../../handling/application/handlingGateway';
import type { LocationGateway } from '../../locations/application/locationGateway';
import { LocationRejected } from '../../locations/application/locationGateway';
import type { MovementGateway } from '../../movements/application/movementGateway';
import { MovementRejected } from '../../movements/application/movementGateway';
import type { OccurrenceGateway } from '../../occurrences/application/occurrenceGateway';
import { DecisionRejected } from '../../occurrences/application/occurrenceGateway';
import { pendingStore } from '../domain/pending';
import type { PendingKind } from '../domain/pending';

export type TrackedGateways = {
  batches: BatchGateway;
  movements: MovementGateway;
  occurrences: OccurrenceGateway;
  handling: HandlingGateway;
  locations?: LocationGateway;
};

// Recusa definitiva do banco: a operação não foi gravada e não há o que conferir depois.
function definitive(cause: unknown) {
  return (
    cause instanceof BatchRejected ||
    cause instanceof MovementRejected ||
    cause instanceof DecisionRejected ||
    cause instanceof HandlingRejected ||
    cause instanceof LocationRejected
  );
}

type Input = { intentId: string } & Record<string, unknown>;

// Decorador dos gateways de escrita (desenho 4.7): antes de enviar, guarda a tentativa; sucesso ou
// recusa definitiva a apagam; qualquer outro resultado (conexão caiu, resposta perdida) a mantém para
// ser conferida no servidor. Nenhuma tela de escrita precisa mudar, e nada é reenviado sozinho.
export function trackGateways(
  gateways: TrackedGateways,
  userId: string,
  now: () => number = Date.now,
): TrackedGateways {
  async function track<R>(
    kind: PendingKind,
    scope: CatalogScope,
    input: Input,
    summary: string,
    call: () => Promise<R>,
  ): Promise<R> {
    pendingStore.add(
      userId,
      {
        intentId: input.intentId,
        kind,
        organizationId: scope.organizationId,
        establishmentId: scope.establishmentId,
        createdAt: now(),
        summary: summary.slice(0, 200),
        input: JSON.parse(JSON.stringify(input)) as Record<string, unknown>,
      },
      now(),
    );
    try {
      const result = await call();
      pendingStore.remove(userId, input.intentId, now());
      return result;
    } catch (cause) {
      if (definitive(cause)) pendingStore.remove(userId, input.intentId, now());
      throw cause;
    }
  }
  const movementLabel = { consumption: 'Consumo', discard: 'Descarte' };
  return {
    ...gateways,
    batches: {
      ...gateways.batches,
      receive: (scope, input) =>
        track(
          'receipt',
          scope,
          input as unknown as Input,
          `Recebimento do lote ${input.sourceCode} (${input.quantity})`,
          () => gateways.batches.receive(scope, input),
        ),
    },
    movements: {
      ...gateways.movements,
      record: (scope, input) =>
        track(
          'movement',
          scope,
          input as unknown as Input,
          input.kind === 'reversal'
            ? 'Anulação de saída'
            : `${movementLabel[input.kind]} de ${input.quantity}`,
          () => gateways.movements.record(scope, input),
        ),
    },
    occurrences: {
      ...gateways.occurrences,
      decide: (scope, input) =>
        track(
          'decision',
          scope,
          input as unknown as Input,
          `Decisão de ocorrência: ${input.decision === 'released' ? 'liberar' : 'rejeitar'}`,
          () => gateways.occurrences.decide(scope, input),
        ),
    },
    locations: gateways.locations && {
      ...gateways.locations,
      create: (scope, input) =>
        track(
          'location',
          scope,
          input as unknown as Input,
          `Local ${input.name}`,
          () => gateways.locations!.create(scope, input),
        ),
      move: (scope, input) =>
        track(
          'location_move',
          scope,
          input as unknown as Input,
          'Mudança de local',
          () => gateways.locations!.move(scope, input),
        ),
    },
    handling: {
      ...gateways.handling,
      handle: (scope, input) =>
        track(
          'handling',
          scope,
          input as unknown as Input,
          input.kind === 'opening'
            ? 'Abertura de embalagem'
            : `Porcionamento em ${input.quantities.length} porções`,
          () => gateways.handling.handle(scope, input),
        ),
      void: (scope, input) =>
        track(
          'void',
          scope,
          input as unknown as Input,
          'Anulação de manipulação',
          () => gateways.handling.void(scope, input),
        ),
    },
  };
}
