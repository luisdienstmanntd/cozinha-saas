import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { PendingAttempts } from './components/PendingAttempts';
import { PENDING_LIMIT, PENDING_TTL_MS, pendingStore } from './domain/pending';
import type { PendingAttempt } from './domain/pending';
import { trackGateways } from './application/trackGateways';
import type { TrackedGateways } from './application/trackGateways';
import { createOperationGateway } from './data/supabaseOperations';
import { BatchRejected } from '../batches/application/batchGateway';
import { MovementRejected } from '../movements/application/movementGateway';
import { DecisionRejected } from '../occurrences/application/occurrenceGateway';
import { HandlingRejected } from '../handling/application/handlingGateway';
import type { SupabaseClient } from '@supabase/supabase-js';

const user = '12345678-1234-4234-8234-123456789abc';
const scope = {
  organizationId: '22345678-1234-4234-8234-123456789abc',
  establishmentId: '32345678-1234-4234-8234-123456789abc',
};
const intent = (n: number) =>
  `42345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
const attempt = (n: number, patch: Partial<PendingAttempt> = {}) =>
  ({
    intentId: intent(n),
    kind: 'handling',
    ...scope,
    createdAt: Date.now(),
    summary: 'Abertura de embalagem',
    input: { intentId: intent(n) },
    ...patch,
  }) satisfies PendingAttempt;

beforeEach(() => localStorage.clear());

it('guarda por usuário, expira em 24 horas, limita e ignora lixo', () => {
  pendingStore.add(user, attempt(1));
  expect(pendingStore.list(user)).toHaveLength(1);
  expect(pendingStore.list('outro-usuario')).toHaveLength(0);
  expect(pendingStore.list(user, Date.now() + PENDING_TTL_MS + 1)).toHaveLength(
    0,
  );
  pendingStore.add(user, attempt(1, { summary: 'de novo' }));
  expect(pendingStore.list(user)).toHaveLength(1);
  for (let n = 2; n < PENDING_LIMIT + 5; n++)
    pendingStore.add(user, attempt(n));
  expect(pendingStore.list(user)).toHaveLength(PENDING_LIMIT);
  localStorage.setItem(`pending-attempts:v1:${user}`, '{"quebrado"');
  expect(pendingStore.list(user)).toEqual([]);
  localStorage.setItem(
    `pending-attempts:v1:${user}`,
    JSON.stringify([{ intentId: 'x' }, attempt(1)]),
  );
  expect(pendingStore.list(user)).toHaveLength(1);
});

function gateways(error?: unknown): TrackedGateways {
  const call = error
    ? vi.fn().mockRejectedValue(error)
    : vi.fn().mockResolvedValue('id');
  return {
    batches: { list: vi.fn(), receive: call },
    movements: { list: vi.fn(), record: call },
    occurrences: { list: vi.fn(), decide: call },
    handling: {
      context: vi.fn(),
      members: vi.fn(),
      setDisplayName: vi.fn(),
      handle: call,
      created: vi.fn(),
      family: vi.fn(),
      void: call,
    },
  } as unknown as TrackedGateways;
}
const handlingInput = {
  sourceContainerId: user,
  kind: 'portioning',
  quantities: ['1', '2'],
  intentId: intent(7),
} as never;

it('sucesso apaga a tentativa; guardada antes de enviar', async () => {
  const g = trackGateways(gateways(), user);
  let during = 0;
  vi.mocked(g.handling.handle);
  const inner = gateways();
  vi.mocked(inner.handling.handle).mockImplementation(async () => {
    during = pendingStore.list(user).length;
    return 'id';
  });
  await trackGateways(inner, user).handling.handle(scope, handlingInput);
  expect(during).toBe(1);
  expect(pendingStore.list(user)).toHaveLength(0);
  await g.handling.handle(scope, handlingInput);
  expect(pendingStore.list(user)).toHaveLength(0);
});

it('recusa definitiva apaga; resultado incerto mantém, com o mesmo identificador', async () => {
  for (const refusal of [
    new BatchRejected('x'),
    new MovementRejected('x'),
    new DecisionRejected('x'),
    new HandlingRejected('x'),
  ]) {
    const g = trackGateways(gateways(refusal), user);
    await expect(g.handling.handle(scope, handlingInput)).rejects.toBe(refusal);
    expect(pendingStore.list(user)).toHaveLength(0);
  }
  const g = trackGateways(gateways(new Error('rede')), user);
  await expect(g.handling.handle(scope, handlingInput)).rejects.toThrow('rede');
  await expect(g.handling.handle(scope, handlingInput)).rejects.toThrow('rede');
  const kept = pendingStore.list(user);
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatchObject({
    intentId: intent(7),
    kind: 'handling',
    summary: 'Porcionamento em 2 porções',
  });
  // Cada tipo de operação guarda o seu.
  await expect(
    g.batches.receive(scope, {
      sourceCode: 'L-1',
      quantity: '2',
      intentId: intent(8),
    } as never),
  ).rejects.toThrow();
  await expect(
    g.movements.record(scope, {
      batchId: user,
      kind: 'discard',
      quantity: '1',
      reason: 'x',
      intentId: intent(9),
    }),
  ).rejects.toThrow();
  await expect(
    g.occurrences.decide(scope, {
      decision: 'released',
      intentId: intent(10),
    } as never),
  ).rejects.toThrow();
  await expect(
    g.handling.void(scope, {
      handlingId: user,
      reason: 'x',
      intentId: intent(11),
    }),
  ).rejects.toThrow();
  expect(
    pendingStore.list(user).map((item) => [item.kind, item.summary]),
  ).toEqual([
    ['handling', 'Porcionamento em 2 porções'],
    ['receipt', 'Recebimento do lote L-1 (2)'],
    ['movement', 'Descarte de 1'],
    ['decision', 'Decisão de ocorrência: liberar'],
    ['void', 'Anulação de manipulação'],
  ]);
});

function banner(
  find: Mock,
  resend: Mock = vi.fn().mockResolvedValue(undefined),
  onResolved = vi.fn(),
) {
  render(
    <PendingAttempts
      scope={scope}
      userId={user}
      timezone="America/Sao_Paulo"
      operations={{ find: find as never }}
      resend={resend as never}
      onResolved={onResolved}
    />,
  );
  return { resend, onResolved };
}

it('sem tentativas pendentes não mostra nada', () => {
  banner(vi.fn());
  expect(screen.queryByRole('region')).toBeNull();
});

it('servidor já tem a operação: "Registro confirmado", sem enviar de novo', async () => {
  const user_ = userEvent.setup();
  pendingStore.add(user, attempt(1));
  const find = vi.fn().mockResolvedValue({
    kind: 'handling',
    id: user,
    createdAt: '2026-11-13T17:32:00Z',
  });
  const { resend, onResolved } = banner(find);
  expect(await screen.findByText('Registro confirmado')).toBeVisible();
  expect(screen.getByText(/Há 1 registro não confirmado/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Enviar novamente' })).toBeNull();
  expect(find).toHaveBeenCalledWith(scope, intent(1));
  await user_.click(screen.getByRole('button', { name: 'Entendi' }));
  expect(pendingStore.list(user)).toHaveLength(0);
  expect(onResolved).toHaveBeenCalled();
  expect(resend).not.toHaveBeenCalled();
});

it('servidor não tem: oferece enviar de novo com o mesmo identificador, nunca sozinha', async () => {
  const user_ = userEvent.setup();
  pendingStore.add(user, attempt(2, { summary: 'Abertura de embalagem' }));
  const { resend, onResolved } = banner(vi.fn().mockResolvedValue(null));
  expect(
    await screen.findByText(/O servidor não tem este registro/),
  ).toBeVisible();
  expect(resend).not.toHaveBeenCalled();
  await user_.click(screen.getByRole('button', { name: 'Enviar novamente' }));
  await waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
  expect(resend.mock.calls[0]![0]).toMatchObject({ intentId: intent(2) });
  expect(
    await screen.findByText('Registro enviado e confirmado.'),
  ).toBeVisible();
  expect(pendingStore.list(user)).toHaveLength(0);
  expect(onResolved).toHaveBeenCalled();
});

it('envio recusado mostra a mensagem, confere de novo e mantém a tentativa', async () => {
  const user_ = userEvent.setup();
  pendingStore.add(user, attempt(3));
  const find = vi.fn().mockResolvedValue(null);
  const resend = vi
    .fn()
    .mockRejectedValue(new Error('Quantidade excede saldo registrado.'));
  banner(find, resend);
  await user_.click(
    await screen.findByRole('button', { name: 'Enviar novamente' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Quantidade excede saldo registrado.',
  );
  await waitFor(() => expect(find).toHaveBeenCalledTimes(2));
  expect(pendingStore.list(user)).toHaveLength(1);
});

it('descartar apaga só a tentativa; falha na conferência só oferece conferir de novo', async () => {
  const user_ = userEvent.setup();
  pendingStore.add(user, attempt(4));
  const find = vi
    .fn()
    .mockRejectedValueOnce(new Error('rede'))
    .mockResolvedValue(null);
  banner(find);
  expect(await screen.findByText(/Não foi possível conferir/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Descartar tentativa' }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: 'Enviar novamente' })).toBeNull();
  await user_.click(screen.getByRole('button', { name: 'Conferir de novo' }));
  await user_.click(
    await screen.findByRole('button', { name: 'Descartar tentativa' }),
  );
  expect(pendingStore.list(user)).toHaveLength(0);
});

it('tentativa de outra unidade não aparece', () => {
  pendingStore.add(
    user,
    attempt(5, { establishmentId: '52345678-1234-4234-8234-123456789abc' }),
  );
  banner(vi.fn());
  expect(screen.queryByRole('region')).toBeNull();
});

it('gateway de conferência lê find_operation pela RLS e valida a resposta', async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({
      data: [{ kind: 'receipt', id: user, created_at: '2026-11-13T17:32:00Z' }],
      error: null,
    })
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: null, error: { code: '42501' } });
  const gateway = createOperationGateway({ rpc } as unknown as SupabaseClient);
  expect(await gateway.find(scope, intent(1))).toEqual({
    kind: 'receipt',
    id: user,
    createdAt: '2026-11-13T17:32:00Z',
  });
  expect(rpc).toHaveBeenCalledWith('find_operation', {
    p_organization_id: scope.organizationId,
    p_establishment_id: scope.establishmentId,
    p_intent_id: intent(1),
  });
  expect(await gateway.find(scope, intent(1))).toBeNull();
  await expect(gateway.find(scope, intent(1))).rejects.toThrow('conferir');
});
