import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HistoryGateway } from './application/historyGateway';
import { HistoryPanel } from './components/HistoryPanel';
import { SOURCE_LIMIT, createHistoryGateway } from './data/supabaseHistory';
import {
  HISTORY_GROUPS,
  csvCell,
  csvFilename,
  filterEvents,
  periodRange,
  registryTitle,
  registryValue,
  sortEvents,
  toCsv,
  type HistoryEvent,
} from './domain/history';

const uuid = (n: number) =>
  `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
const scope = { organizationId: uuid(1), establishmentId: uuid(2) };
const TZ = 'America/Sao_Paulo';

function event(over: Partial<HistoryEvent> = {}): HistoryEvent {
  return {
    id: 'e1',
    at: '2026-11-20T15:30:00.000Z',
    group: 'exits',
    title: 'Consumo',
    product: 'Peito de peru',
    container: 'C-000123',
    quantity: '0,3 kg',
    detail: null,
    reason: null,
    actor: 'Ana',
    ...over,
  };
}

describe('domínio do histórico', () => {
  it('ordena do mais recente ao mais antigo e desempata pelo identificador', () => {
    const sorted = sortEvents([
      event({ id: 'b', at: '2026-11-20T10:00:00Z' }),
      event({ id: 'a', at: '2026-11-20T10:00:00Z' }),
      event({ id: 'c', at: '2026-11-21T10:00:00Z' }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('filtra por tipo e busca sem diferenciar maiúsculas e acentos de caixa', () => {
    const list = [
      event({ id: '1', group: 'exits', product: 'Peito de peru' }),
      event({
        id: '2',
        group: 'receipts',
        title: 'Recebimento',
        product: 'Arroz',
      }),
      event({
        id: '3',
        group: 'exits',
        product: 'Feijão',
        reason: 'Embalagem VAZADA',
      }),
    ];
    const all = new Set(HISTORY_GROUPS);
    expect(filterEvents(list, all, '').length).toBe(3);
    expect(
      filterEvents(list, new Set(['receipts']), '').map((e) => e.id),
    ).toEqual(['2']);
    expect(filterEvents(list, all, 'vazada').map((e) => e.id)).toEqual(['3']);
    expect(filterEvents(list, all, '  PERU ').map((e) => e.id)).toEqual(['1']);
    expect(filterEvents(list, new Set(), '')).toEqual([]);
  });

  it('alterações de cadastro em palavras, sem códigos internos', () => {
    expect(registryTitle('product', 'storage_condition')).toBe(
      'Alteração do produto: conservação',
    );
    expect(registryTitle('establishment', 'production_window_minutes')).toBe(
      'Alteração da unidade: janela de registro da produção',
    );
    expect(registryTitle('algo', 'novo')).toBe('Alteração do cadastro: novo');
    expect(registryValue('storage_condition', 'refrigerated')).toBe(
      'Refrigerado',
    );
    expect(registryValue('production_window_minutes', '120')).toBe('120 min');
    expect(registryValue('production_registrar', 'member')).toBe(
      'Cada colaborador registra a própria produção',
    );
    expect(registryValue('name', null)).toBe('—');
    expect(registryValue('name', 'Unidade Centro')).toBe('Unidade Centro');
  });

  it('o período termina agora e volta o número de dias pedido', () => {
    const now = new Date('2026-11-27T12:00:00Z');
    const { from, to } = periodRange(now, 30);
    expect(to).toBe(now);
    expect(now.getTime() - from.getTime()).toBe(30 * 86_400_000);
  });

  it('CSV: aspas e separadores protegidos, fórmulas neutralizadas', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell('simples')).toBe('simples');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
    for (const perigoso of ['=1+1', '+SOMA(A1)', '-2', '@cmd', '\tx', '\rx'])
      expect(csvCell(perigoso).replace(/^"/, '').startsWith("'")).toBe(true);
    expect(csvCell('=HYPERLINK("http://x";"y")')).toBe(
      '"\'=HYPERLINK(""http://x"";""y"")"',
    );
  });

  it('CSV: BOM, cabeçalho, hora no fuso da unidade, instante UTC e vírgula decimal', () => {
    const csv = toCsv(
      [event({ detail: 'De A para B', reason: 'Embalagem; aberta' })],
      TZ,
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, row, end] = csv.slice(1).split('\r\n');
    expect(header).toBe(
      'Data e hora;Instante (UTC);Tipo;Evento;Produto;Recipiente;Quantidade;Detalhe;Motivo ou observação;Responsável',
    );
    expect(row).toBe(
      '20/11/2026 12:30;2026-11-20T15:30:00.000Z;Saídas;Consumo;Peito de peru;C-000123;0,3 kg;De A para B;"Embalagem; aberta";Ana',
    );
    expect(end).toBe('');
  });

  it('CSV sem registros traz só o cabeçalho', () => {
    expect(toCsv([], TZ).slice(1).split('\r\n').filter(Boolean)).toHaveLength(
      1,
    );
  });

  it('nome do arquivo: ASCII, sem acento e com a data do dia no fuso da unidade', () => {
    // 28/11 01:30 UTC ainda é 27/11 em Brasília.
    expect(
      csvFilename(
        'Cozinha Preparação/Centro!',
        new Date('2026-11-28T01:30:00Z'),
        TZ,
      ),
    ).toBe('historico-cozinha-preparacao-centro-2026-11-27.csv');
    expect(csvFilename('???', new Date('2026-11-27T12:00:00Z'), TZ)).toBe(
      'historico-unidade-2026-11-27.csv',
    );
  });
});

// ---------- gateway ----------
type Rows = Record<string, unknown[]>;
function fakeClient(rows: Rows, failing?: string) {
  const calls: { table: string; ops: [string, ...unknown[]][] }[] = [];
  const client = {
    from(table: string) {
      const call = { table, ops: [] as [string, ...unknown[]][] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const name of [
        'select',
        'eq',
        'in',
        'or',
        'gte',
        'lt',
        'order',
        'limit',
      ])
        chain[name] = (...args: unknown[]) => {
          call.ops.push([name, ...args]);
          return chain;
        };
      chain.then = (resolve: (value: unknown) => unknown) =>
        resolve(
          table === failing
            ? { data: null, error: { message: 'boom: detalhe técnico' } }
            : { data: rows[table] ?? [], error: null },
        );
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const batch = uuid(10);
const product = uuid(11);
const container = uuid(12);
const user = uuid(13);
const period = {
  from: new Date('2026-10-28T12:00:00Z'),
  to: new Date('2026-11-27T12:00:00Z'),
};
const sample: Rows = {
  batch_receipts: [
    // Recebimento da lista e, pela consulta por identificador, o lote das saídas.
    {
      id: batch,
      product_id: product,
      supplier_id: uuid(14),
      quantity: '1000',
      unit: 'g',
      expiry_date: '2026-12-01',
      created_by: user,
      created_at: '2026-11-10T09:00:00Z',
    },
  ],
  products: [{ id: product, name: 'Peito de peru' }],
  suppliers: [{ id: uuid(14), name: 'Frios Alfa' }],
  containers: [{ id: container, short_code: 'C-000123' }],
  storage_locations: [
    { id: uuid(15), name: 'Câmara 1' },
    { id: uuid(16), name: 'Câmara 2' },
  ],
  memberships: [{ user_id: user, display_name: 'Ana' }],
  stock_movements: [
    {
      id: uuid(20),
      batch_id: batch,
      container_id: container,
      kind: 'consumption',
      quantity: '300',
      reason: 'Almoço',
      created_by: user,
      created_at: '2026-11-12T12:00:00Z',
    },
    {
      id: uuid(21),
      batch_id: batch,
      container_id: container,
      kind: 'reversal',
      quantity: '300',
      reason: 'Lançado por engano',
      created_by: uuid(99),
      created_at: '2026-11-12T12:05:00Z',
    },
  ],
  location_moves: [
    {
      id: uuid(30),
      container_id: container,
      from_location_id: uuid(15),
      to_location_id: uuid(16),
      handled_by_name: 'Bia',
      created_at: '2026-11-13T08:00:00Z',
    },
  ],
  occurrences: [
    {
      id: uuid(40),
      batch_id: batch,
      kind: 'temperature_not_measured',
      reason: 'Termômetro sem bateria',
      created_by: user,
      created_at: '2026-11-10T09:01:00Z',
    },
  ],
  occurrence_decisions: [
    {
      id: uuid(41),
      batch_id: batch,
      decision: 'rejected',
      reason: 'Sem medição',
      created_by: user,
      created_at: '2026-11-10T10:00:00Z',
    },
  ],
  entity_changes: [
    {
      id: uuid(50),
      entity: 'establishment',
      entity_id: uuid(2),
      field: 'name',
      old_value: 'Unidade A',
      new_value: 'Unidade Centro',
      changed_by: null,
      changed_at: '2026-11-11T08:00:00Z',
    },
  ],
};

describe('gateway do histórico', () => {
  it('junta os registros com nomes legíveis, do mais recente ao mais antigo', async () => {
    const { client } = fakeClient(sample);
    const { events, truncated } = await createHistoryGateway(client).read(
      scope,
      period,
    );
    expect(truncated).toBe(false);
    expect(events.map((e) => e.id)).toEqual([
      `move:${uuid(30)}`,
      `movement:${uuid(21)}`,
      `movement:${uuid(20)}`,
      `registry:${uuid(50)}`,
      `decision:${uuid(41)}`,
      `occurrence:${uuid(40)}`,
      `receipt:${batch}`,
    ]);
    const byId = Object.fromEntries(events.map((e) => [e.id, e]));
    expect(byId[`receipt:${batch}`]).toMatchObject({
      title: 'Recebimento',
      product: 'Peito de peru',
      quantity: '1000 g',
      detail: 'Fornecedor: Frios Alfa · Validade: 01/12/2026',
      actor: 'Ana',
    });
    expect(byId[`movement:${uuid(20)}`]).toMatchObject({
      title: 'Consumo',
      container: 'C-000123',
      quantity: '300 g',
      reason: 'Almoço',
      actor: 'Ana',
    });
    // Quem já não tem nome cadastrado não vira texto técnico.
    expect(byId[`movement:${uuid(21)}`]).toMatchObject({
      title: 'Saída anulada',
      actor: 'Sem nome cadastrado',
    });
    expect(byId[`move:${uuid(30)}`]).toMatchObject({
      detail: 'De Câmara 1 para Câmara 2',
      actor: 'Bia',
    });
    expect(byId[`decision:${uuid(41)}`]!.title).toBe('Decisão: recusado');
    expect(byId[`registry:${uuid(50)}`]).toMatchObject({
      title: 'Alteração da unidade: nome',
      detail: 'Unidade A → Unidade Centro',
      actor: 'Administração do sistema',
    });
  });

  it('consulta só a unidade e o período, só recebimentos e saídas de estoque, e em ordem', async () => {
    const { client, calls } = fakeClient(sample);
    await createHistoryGateway(client).read(scope, period);
    const first = (table: string) => calls.find((c) => c.table === table)!;
    for (const table of [
      'batch_receipts',
      'stock_movements',
      'location_moves',
    ]) {
      const ops = first(table).ops;
      expect(ops).toContainEqual([
        'eq',
        'organization_id',
        scope.organizationId,
      ]);
      expect(ops).toContainEqual([
        'eq',
        'establishment_id',
        scope.establishmentId,
      ]);
      expect(ops).toContainEqual([
        'gte',
        'created_at',
        period.from.toISOString(),
      ]);
      expect(ops).toContainEqual(['lt', 'created_at', period.to.toISOString()]);
      expect(ops).toContainEqual(['limit', SOURCE_LIMIT]);
    }
    expect(first('batch_receipts').ops).toContainEqual([
      'eq',
      'origin',
      'received',
    ]);
    expect(first('stock_movements').ops).toContainEqual([
      'in',
      'kind',
      ['consumption', 'discard', 'reversal'],
    ]);
    expect(first('location_moves').ops).toContainEqual(['eq', 'kind', 'move']);
    // Alterações de cadastro: as da unidade e as da organização inteira.
    expect(first('entity_changes').ops).toContainEqual([
      'or',
      `establishment_id.is.null,establishment_id.eq.${scope.establishmentId}`,
    ]);
    // Nada além de leitura.
    for (const call of calls)
      expect(
        call.ops.some(([name]) => /insert|update|delete|rpc/.test(name)),
      ).toBe(false);
  });

  it('avisa quando um tipo chega ao limite da consulta', async () => {
    const many = Array.from({ length: SOURCE_LIMIT }, (_, i) => ({
      id: uuid(1000 + i),
      batch_id: batch,
      container_id: null,
      kind: 'discard',
      quantity: '1',
      reason: null,
      created_by: user,
      created_at: '2026-11-12T12:00:00Z',
    }));
    const { client } = fakeClient({ ...sample, stock_movements: many });
    const result = await createHistoryGateway(client).read(scope, period);
    expect(result.truncated).toBe(true);
  });

  it('erro do banco vira mensagem sem detalhe técnico', async () => {
    const { client } = fakeClient(sample, 'occurrences');
    await expect(
      createHistoryGateway(client).read(scope, period),
    ).rejects.toThrow('Não foi possível consultar o histórico da unidade.');
  });

  it('lê consultas por identificador em blocos, sem estourar o endereço', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: uuid(2000 + i),
      batch_id: uuid(3000 + i),
      container_id: null,
      kind: 'consumption',
      quantity: '1',
      reason: null,
      created_by: user,
      created_at: '2026-11-12T12:00:00Z',
    }));
    const { client, calls } = fakeClient({ ...sample, stock_movements: many });
    await createHistoryGateway(client).read(scope, period);
    const lotes = calls
      .filter(
        (c) => c.table === 'batch_receipts' && c.ops.some(([n]) => n === 'in'),
      )
      .map((c) => (c.ops.find(([n]) => n === 'in')![2] as string[]).length);
    expect(lotes.sort((a, b) => b - a)).toEqual([100, 100, 51]);
  });
});

// ---------- tela ----------
afterEach(() => vi.restoreAllMocks());

function gatewayOf(
  events: HistoryEvent[],
  truncated = false,
): HistoryGateway & { read: ReturnType<typeof vi.fn> } {
  return { read: vi.fn().mockResolvedValue({ events, truncated }) };
}
function renderPanel(gateway: HistoryGateway) {
  return render(
    <HistoryPanel
      scope={scope}
      timezone={TZ}
      unitName="Cozinha Central"
      gateway={gateway}
    />,
  );
}

describe('tela do histórico', () => {
  it('mostra os registros com data no fuso da unidade e só consulta', async () => {
    const gateway = gatewayOf([
      event({ id: 'a', detail: 'Validade: 01/12/2026', reason: 'Almoço' }),
    ]);
    renderPanel(gateway);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Carregando o histórico',
    );
    const list = await screen.findByRole('list', {
      name: 'Registros do histórico',
    });
    const item = within(list).getByRole('listitem');
    expect(item).toHaveTextContent('Consumo');
    expect(item).toHaveTextContent('20/11/2026 12:30');
    expect(item).toHaveTextContent('Peito de peru · C-000123 · 0,3 kg');
    expect(item).toHaveTextContent('Motivo ou observação: Almoço');
    expect(item).toHaveTextContent('Por Ana');
    expect(screen.getByRole('status')).toHaveTextContent('1 registro');
    expect(gateway.read).toHaveBeenCalledTimes(1);
    expect(gateway.read.mock.calls[0]![0]).toEqual(scope);
  });

  it('filtra por tipo e busca, e o CSV leva exatamente a lista mostrada', async () => {
    const user = userEvent.setup();
    const created: Blob[] = [];
    const create = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:teste';
    });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderPanel(
      gatewayOf([
        event({ id: 'a', group: 'exits', product: 'Peito de peru' }),
        event({
          id: 'b',
          group: 'receipts',
          title: 'Recebimento',
          product: 'Arroz',
        }),
        event({ id: 'c', group: 'exits', product: 'Feijão', reason: '=CMD()' }),
      ]),
    );
    await screen.findByRole('list', { name: 'Registros do histórico' });
    expect(screen.getByRole('status')).toHaveTextContent('3 registros');

    await user.click(screen.getByRole('checkbox', { name: 'Recebimentos' }));
    expect(screen.getByRole('status')).toHaveTextContent('2 registros');
    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar no histórico' }),
      'feij',
    );
    expect(screen.getByRole('status')).toHaveTextContent('1 registro');

    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(click).toHaveBeenCalledTimes(1);
    const csv = await created[0]!.text();
    expect(csv).toContain('Feijão');
    expect(csv).not.toContain('Peito de peru');
    expect(csv).not.toContain('Arroz');
    // Fórmula neutralizada no arquivo.
    expect(csv).toContain("'=CMD()");
  });

  it('sem registros: aviso de zero real e sem exportação', async () => {
    renderPanel(gatewayOf([]));
    expect(
      await screen.findByText('Nenhum registro no período.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
  });

  it('filtros sem resultado dizem que é o filtro, não que o período está vazio', async () => {
    const user = userEvent.setup();
    renderPanel(gatewayOf([event()]));
    await screen.findByRole('list', { name: 'Registros do histórico' });
    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar no histórico' }),
      'zzz',
    );
    expect(
      screen.getByText('Nenhum registro com esses filtros.'),
    ).toBeInTheDocument();
  });

  it('avisa quando o histórico foi limitado', async () => {
    renderPanel(gatewayOf([event()], true));
    expect(await screen.findByRole('note')).toHaveTextContent(
      'mostram os mais recentes de cada tipo',
    );
  });

  it('troca o período e consulta de novo', async () => {
    const user = userEvent.setup();
    const gateway = gatewayOf([event()]);
    renderPanel(gateway);
    await screen.findByRole('list', { name: 'Registros do histórico' });
    await user.click(screen.getByRole('button', { name: 'Últimos 7 dias' }));
    await waitFor(() => expect(gateway.read).toHaveBeenCalledTimes(2));
    const [, range] = gateway.read.mock.calls[1]!;
    expect(range.to.getTime() - range.from.getTime()).toBe(7 * 86_400_000);
    expect(
      screen.getByRole('button', { name: 'Últimos 7 dias' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('falha ao consultar: alerta sem detalhe técnico, sem exportar, e nova tentativa', async () => {
    const user = userEvent.setup();
    const gateway: HistoryGateway & { read: ReturnType<typeof vi.fn> } = {
      read: vi
        .fn()
        .mockRejectedValueOnce(new Error('boom: detalhe técnico'))
        .mockResolvedValueOnce({ events: [event()], truncated: false }),
    };
    renderPanel(gateway);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Não foi possível carregar o histórico da unidade.',
    );
    expect(alert).not.toHaveTextContent('boom');
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(
      await screen.findByRole('list', { name: 'Registros do histórico' }),
    ).toBeInTheDocument();
  });
});
