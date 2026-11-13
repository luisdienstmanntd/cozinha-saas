import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOccurrenceGateway } from './supabaseOccurrences';
import { DecisionRejected } from '../application/occurrenceGateway';

const scope = {
  organizationId: '12345678-1234-4234-8234-123456789abc',
  establishmentId: '22345678-1234-4234-8234-123456789abc',
};
const row = {
  occurrence_id: '32345678-1234-4234-8234-123456789abc',
  kind: 'temperature_not_measured',
  batch_id: '42345678-1234-4234-8234-123456789abc',
  handling_id: null,
  product_name: 'Frango',
  source_code: 'L-1',
  unit: 'kg',
  reason: 'Termômetro sem pilha',
  created_at: '2026-11-13T12:00:00+00:00',
  timezone: 'America/Sao_Paulo',
  status: 'pending',
  decision_reason: null,
  decided_at: null,
  containers: [],
};
function client(rpcResult: unknown, access: unknown = { id: 'x' }) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: access, error: null }),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return {
    rpc,
    client: {
      rpc,
      from: vi.fn().mockReturnValue(q),
    } as unknown as SupabaseClient,
  };
}

it('lê as ocorrências abertas pelo servidor, com escopo e limite', async () => {
  const { rpc, client: c } = client({ data: [row], error: null });
  const rows = await createOccurrenceGateway(c).list(scope, 'open');
  expect(rows).toHaveLength(1);
  expect(rpc).toHaveBeenCalledWith('list_occurrences', {
    p_organization_id: scope.organizationId,
    p_establishment_id: scope.establishmentId,
    p_scope: 'open',
    p_limit: 200,
  });
});

it('lista vazia sem acesso à unidade vira erro, não "nenhuma ocorrência"', async () => {
  const { client: c } = client({ data: [], error: null }, null);
  await expect(createOccurrenceGateway(c).list(scope, 'open')).rejects.toThrow(
    'Acesso ao estabelecimento indisponível',
  );
});

it('recusa linha fora do formato esperado', async () => {
  const { client: c } = client({
    data: [{ ...row, status: 'approved' }],
    error: null,
  });
  await expect(createOccurrenceGateway(c).list(scope, 'all')).rejects.toThrow();
});

it('envia a decisão com justificativa aparada e trata recusas', async () => {
  const input = {
    occurrenceId: row.occurrence_id,
    decision: 'rejected' as const,
    reason: '  Embalagem morna ',
    intentId: '52345678-1234-4234-8234-123456789abc',
  };
  const ok = client({
    data: '62345678-1234-4234-8234-123456789abc',
    error: null,
  });
  await expect(
    createOccurrenceGateway(ok.client).decide(scope, input),
  ).resolves.toBe('62345678-1234-4234-8234-123456789abc');
  expect(ok.rpc).toHaveBeenCalledWith('decide_occurrence', {
    p_organization_id: scope.organizationId,
    p_establishment_id: scope.establishmentId,
    p_occurrence_id: row.occurrence_id,
    p_decision: 'rejected',
    p_reason: 'Embalagem morna',
    p_intent_id: input.intentId,
  });
  for (const code of ['23505', '22023', '42501', '23503']) {
    const refused = client({ data: null, error: { code } });
    await expect(
      createOccurrenceGateway(refused.client).decide(scope, input),
    ).rejects.toBeInstanceOf(DecisionRejected);
  }
  const network = client({ data: null, error: { code: 'PGRST000' } });
  const failure = await createOccurrenceGateway(network.client)
    .decide(scope, input)
    .catch((cause) => cause);
  expect(failure).not.toBeInstanceOf(DecisionRejected);
  expect(failure.message).toContain('Repita a mesma tentativa');
  await expect(
    createOccurrenceGateway(ok.client).decide(scope, {
      ...input,
      reason: '   ',
    }),
  ).rejects.toThrow();
});
