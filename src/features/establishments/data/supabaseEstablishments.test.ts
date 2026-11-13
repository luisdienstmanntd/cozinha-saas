import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createEstablishmentGateway } from './supabaseEstablishments';
import {
  EstablishmentRejected,
  EstablishmentUncertain,
} from '../application/establishmentGateway';

const org = '20000000-0000-4000-8000-000000000001';
function insertClient(result: unknown, reject = false) {
  const chain = { insert: vi.fn(), select: vi.fn(), single: vi.fn() };
  chain.insert.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  if (reject) chain.single.mockRejectedValue(new TypeError('fetch failed'));
  else chain.single.mockResolvedValue(result);
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as SupabaseClient, chain, from };
}

describe('gravação de unidades', () => {
  it('envia somente organização, nome aparado e fuso permitido', async () => {
    const { client, chain, from } = insertClient({
      data: { id: 'nova' },
      error: null,
    });
    await expect(
      createEstablishmentGateway(client).create(org, {
        name: ' Cozinha 2 ',
        timezone: 'America/Sao_Paulo',
      }),
    ).resolves.toBe('nova');
    expect(from).toHaveBeenCalledWith('establishments');
    expect(chain.insert).toHaveBeenCalledWith({
      organization_id: org,
      name: 'Cozinha 2',
      timezone: 'America/Sao_Paulo',
    });
  });
  it('valida antes de chamar o banco', async () => {
    const { client, from } = insertClient({ data: null, error: null });
    await expect(
      createEstablishmentGateway(client).create(org, {
        name: 'Cozinha',
        timezone: 'UTC',
      }),
    ).rejects.toThrow('Selecione um fuso horário da lista.');
    expect(from).not.toHaveBeenCalled();
  });
  it('resposta do banco é recusa definitiva; 22023 vira mensagem de fuso', async () => {
    const rejected = insertClient({ data: null, error: { code: '22023' } });
    const zone = createEstablishmentGateway(rejected.client).create(org, {
      name: 'Cozinha',
      timezone: 'America/Sao_Paulo',
    });
    await expect(zone).rejects.toBeInstanceOf(EstablishmentRejected);
    await expect(zone).rejects.toThrow('Fuso horário inválido.');
    const denied = insertClient({ data: null, error: { code: '42501' } });
    await expect(
      createEstablishmentGateway(denied.client).create(org, {
        name: 'Cozinha',
        timezone: 'America/Sao_Paulo',
      }),
    ).rejects.toBeInstanceOf(EstablishmentRejected);
  });
  it('falha de rede ou resposta sem id é incerta e pede conferência', async () => {
    for (const client of [
      insertClient(null, true).client,
      insertClient({ data: null, error: { code: '', message: 'fetch failed' } })
        .client,
      insertClient({ data: null, error: null }).client,
    ]) {
      const result = createEstablishmentGateway(client).create(org, {
        name: 'Cozinha',
        timezone: 'America/Sao_Paulo',
      });
      await expect(result).rejects.toBeInstanceOf(EstablishmentUncertain);
      await expect(result).rejects.toThrow('confira se ela já aparece');
    }
  });
  it('renomear exige exatamente uma linha alterada no escopo da organização', async () => {
    const chain = { update: vi.fn(), eq: vi.fn(), select: vi.fn() };
    chain.update.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.select
      .mockResolvedValueOnce({ data: [{ id: 'u' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
    const gateway = createEstablishmentGateway(client);
    await gateway.rename(org, 'u', ' Nova ');
    expect(chain.update).toHaveBeenCalledWith({ name: 'Nova' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'u');
    expect(chain.eq).toHaveBeenCalledWith('organization_id', org);
    await expect(gateway.rename(org, 'u', 'Nova')).rejects.toThrow(
      'Alteração recusada.',
    );
  });
  it('falha de rede ao renomear não é apresentada como recusa', async () => {
    const chain = { update: vi.fn(), eq: vi.fn(), select: vi.fn() };
    chain.update.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.select
      .mockResolvedValueOnce({ data: null, error: { code: '', message: 'x' } })
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
    const gateway = createEstablishmentGateway(client);
    for (let i = 0; i < 2; i++)
      await expect(gateway.rename(org, 'u', 'Nova')).rejects.toThrow(
        'Não foi possível confirmar a alteração.',
      );
  });
});
