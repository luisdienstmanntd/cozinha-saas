import { readFileSync, readdirSync } from 'node:fs';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogGateway } from '../catalog/application/catalogGateway';
import type { CatalogItem } from '../catalog/domain/catalog';
import type { Member } from '../handling/domain/family';
import type { ProductionGateway } from './application/productionGateway';
import type { LabelGateway } from '../labels/application/labelGateway';
import { ProductionRejected } from './application/productionGateway';
import { createProductionGateway } from './data/supabaseProduction';
import {
  PRODUCTION_MESSAGES,
  daysBetween,
  expiryInWords,
  knownProductionMessage,
  productionInputSchema,
  productionVoidInputSchema,
} from './domain/production';
import type { ProductionRow } from './domain/production';
import {
  PRODUCTION_LATE_TEXT,
  ProductionPanel,
  SAME_DAY_TEXT,
} from './components/ProductionPanel';
import { trackGateways } from '../pending/application/trackGateways';
import type { TrackedGateways } from '../pending/application/trackGateways';
import { kindLabels, pendingStore } from '../pending/domain/pending';

const id = (n: number) =>
  `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
const scope = { organizationId: id(1), establishmentId: id(2) };
const owner = id(3);
const cook = id(4);
const timezone = 'America/Sao_Paulo';
// 14/11/2026 12:00 em São Paulo (UTC-3).
const NOW = new Date('2026-11-14T15:00:00.000Z');
const now = () => NOW;
const caldo = {
  id: id(10),
  name: 'Caldo de legumes',
  unit: 'l' as const,
  storage_condition: 'refrigerated' as const,
};
const members: Member[] = [
  { user_id: owner, display_name: 'Ana Souza', role: 'owner' },
  { user_id: cook, display_name: 'Bruno Lima', role: 'member' },
];
const row = (patch: Partial<ProductionRow> = {}): ProductionRow => ({
  batch_id: id(20),
  product_name: 'Caldo de legumes',
  quantity: 6,
  unit: 'l',
  expiry_date: '2026-11-16',
  produced_at: '2026-11-14T14:30:00.000Z',
  late: false,
  handled_by_name: 'Bruno Lima',
  note: null,
  timezone,
  container_id: id(21),
  short_code: 'C-000123',
  voided: null,
  ...patch,
});

function catalog(items: CatalogItem[] = [caldo]): CatalogGateway {
  return {
    list: vi.fn().mockResolvedValue(items),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
  };
}
function production(rows: ProductionRow[] = []): ProductionGateway & {
  register: ReturnType<typeof vi.fn>;
  void: ReturnType<typeof vi.fn>;
} {
  return {
    list: vi.fn().mockResolvedValue(rows),
    register: vi.fn().mockResolvedValue(id(20)),
    void: vi.fn().mockResolvedValue(id(30)),
  };
}
function panel(
  gateway: ProductionGateway,
  options: {
    canCreate?: boolean;
    items?: CatalogGateway;
    labels?: LabelGateway;
  } = {},
) {
  const loadMembers = vi.fn().mockResolvedValue(members);
  const onChanged = vi.fn();
  render(
    <ProductionPanel
      scope={scope}
      timezone={timezone}
      userId={owner}
      canCreate={options.canCreate ?? true}
      catalog={options.items ?? catalog()}
      gateway={gateway}
      loadMembers={loadMembers}
      setDisplayName={vi.fn()}
      now={now}
      labels={options.labels}
      onChanged={onChanged}
    />,
  );
  return { onChanged, loadMembers };
}
async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { expiry = '2026-11-16', quantity = '6' } = {},
) {
  await user.click(
    await screen.findByRole('button', { name: 'Registrar produção' }),
  );
  const form = within(screen.getByRole('form', { name: 'Registrar produção' }));
  await user.selectOptions(form.getByLabelText('Preparação'), caldo.id);
  await user.type(form.getByLabelText('Quantidade produzida (l)'), quantity);
  await user.type(form.getByLabelText('Validade'), expiry);
  await user.selectOptions(form.getByLabelText('Produzida por'), cook);
  return form;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('domínio da produção', () => {
  it('escreve a validade por extenso, com dia da semana e contagem só para conferência', () => {
    expect(expiryInWords('2026-11-14', '2026-11-16')).toBe(
      '16/11/2026 (segunda-feira), 2 dias depois da produção',
    );
    expect(expiryInWords('2026-11-14', '2026-11-15')).toBe(
      '15/11/2026 (domingo), 1 dia depois da produção',
    );
    expect(expiryInWords('2026-11-14', '2026-11-14')).toBe(
      '14/11/2026 (sábado), no mesmo dia da produção',
    );
    expect(daysBetween('2026-11-14', '2026-11-13')).toBe(-1);
    expect(daysBetween('2026-11-14', '2026-02-30')).toBeNull();
    expect(expiryInWords('2026-11-14', 'x')).toBeNull();
  });
  it('confere a forma do registro e da anulação', () => {
    const base = {
      productId: id(10),
      quantity: '6',
      expiryDate: '2026-11-16',
      producedAt: '2026-11-14T14:30:00.000Z',
      handledBy: cook,
      note: null,
      lateReason: null,
      intentId: id(40),
    };
    expect(productionInputSchema.safeParse(base).success).toBe(true);
    expect(
      productionInputSchema.safeParse({ ...base, quantity: '0' }).success,
    ).toBe(false);
    expect(
      productionInputSchema.safeParse({ ...base, note: 'x'.repeat(301) })
        .success,
    ).toBe(false);
    expect(
      productionVoidInputSchema.safeParse({
        batchId: id(20),
        reason: '  ',
        intentId: id(41),
      }).success,
    ).toBe(false);
  });
  it('repete só mensagens conhecidas, e cada uma existe nas migrações', () => {
    expect(knownProductionMessage(PRODUCTION_MESSAGES[0])).toBe(
      PRODUCTION_MESSAGES[0],
    );
    expect(knownProductionMessage('relation "x" does not exist')).toBeNull();
    const dir = 'supabase/migrations';
    const sql = readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => readFileSync(`${dir}/${file}`, 'utf8'))
      .join('\n');
    for (const message of PRODUCTION_MESSAGES)
      expect(sql.includes(message), message).toBe(true);
  });
});

describe('gateway da produção', () => {
  it('chama register_production e void_production com os parâmetros do banco', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: id(20), error: null })
      .mockResolvedValueOnce({ data: id(30), error: null });
    const gateway = createProductionGateway({
      rpc,
    } as unknown as SupabaseClient);
    await gateway.register(scope, {
      productId: id(10),
      quantity: '6',
      expiryDate: '2026-11-16',
      producedAt: '2026-11-14T14:30:00.000Z',
      handledBy: cook,
      note: null,
      lateReason: null,
      intentId: id(40),
    });
    expect(rpc).toHaveBeenLastCalledWith('register_production', {
      p_organization_id: scope.organizationId,
      p_establishment_id: scope.establishmentId,
      p_product_id: id(10),
      p_quantity: '6',
      p_expiry_date: '2026-11-16',
      p_produced_at: '2026-11-14T14:30:00.000Z',
      p_handled_by: cook,
      p_note: null,
      p_late_reason: null,
      p_intent_id: id(40),
    });
    await gateway.void(scope, {
      batchId: id(20),
      reason: 'validade digitada errada',
      intentId: id(41),
    });
    expect(rpc).toHaveBeenLastCalledWith('void_production', {
      p_organization_id: scope.organizationId,
      p_establishment_id: scope.establishmentId,
      p_batch_id: id(20),
      p_reason: 'validade digitada errada',
      p_intent_id: id(41),
    });
  });
  it('recusa conhecida é definitiva; conflito é marcado; sem código fica incerto', async () => {
    const input = {
      batchId: id(20),
      reason: 'erro',
      intentId: id(41),
    };
    const answer = (error: { code: string; message: string }) =>
      createProductionGateway({
        rpc: vi.fn().mockResolvedValue({ data: null, error }),
      } as unknown as SupabaseClient).void(scope, input);
    const known = await answer({
      code: '22023',
      message: PRODUCTION_MESSAGES.at(-1)!,
    }).catch((e: unknown) => e);
    expect(known).toBeInstanceOf(ProductionRejected);
    expect((known as Error).message).toBe(PRODUCTION_MESSAGES.at(-1));
    const conflict = await answer({
      code: '23505',
      message: 'Identificador já utilizado com outros dados.',
    }).catch((e: unknown) => e);
    expect((conflict as ProductionRejected).conflict).toBe(true);
    const hidden = await answer({
      code: 'P0001',
      message: 'detalhe interno do servidor',
    }).catch((e: unknown) => e);
    expect(hidden).toBeInstanceOf(ProductionRejected);
    expect((hidden as Error).message).not.toContain('detalhe interno');
    const uncertain = await answer({
      code: '',
      message: 'Failed to fetch',
    }).catch((e: unknown) => e);
    expect(uncertain).not.toBeInstanceOf(ProductionRejected);
  });
  it('lista produções com o integral e a anulação', async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            batch_id: id(20),
            produced_at: '2026-11-14T14:30:00+00:00',
            late: false,
            handled_by_name: 'Bruno Lima',
            note: null,
            timezone,
            batch_receipts: {
              quantity: 6,
              unit: 'l',
              expiry_date: '2026-11-16',
              products: { name: 'Caldo de legumes' },
              containers: [
                { id: id(22), short_code: 'C-000124', kind: 'derived' },
                { id: id(21), short_code: 'C-000123', kind: 'integral' },
              ],
            },
            production_voids: {
              reason: 'erro',
              created_at: '2026-11-14T15:00:00+00:00',
            },
          },
        ],
        error: null,
      }),
    };
    const from = vi.fn(() => chain);
    const rows = await createProductionGateway({
      from,
    } as unknown as SupabaseClient).list(scope);
    expect(from).toHaveBeenCalledWith('batch_productions');
    expect(chain.eq).toHaveBeenCalledWith(
      'organization_id',
      scope.organizationId,
    );
    expect(chain.eq).toHaveBeenCalledWith(
      'establishment_id',
      scope.establishmentId,
    );
    expect(rows[0]).toMatchObject({
      short_code: 'C-000123',
      container_id: id(21),
      voided: { reason: 'erro' },
    });
  });
});

describe('tentativa pendente da produção', () => {
  function inner(error?: unknown): TrackedGateways {
    const call = error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue(id(20));
    return {
      batches: { list: vi.fn(), receive: vi.fn() },
      movements: { list: vi.fn(), record: vi.fn() },
      occurrences: { list: vi.fn(), decide: vi.fn() },
      handling: {} as TrackedGateways['handling'],
      production: { list: vi.fn(), register: call, void: call },
    } as unknown as TrackedGateways;
  }
  const input = {
    productId: id(10),
    quantity: '6',
    expiryDate: '2026-11-16',
    producedAt: '2026-11-14T14:30:00.000Z',
    handledBy: cook,
    note: null,
    lateReason: null,
    intentId: id(40),
  };
  it('produção e anulação têm rótulo próprio', () => {
    expect(kindLabels.production).toBe('Produção da cozinha');
    expect(kindLabels.production_void).toBe('Anulação de produção');
  });
  it('resultado incerto fica guardado; sucesso e recusa definitiva apagam', async () => {
    await expect(
      trackGateways(inner(new Error('rede')), owner).production!.register(
        scope,
        input,
      ),
    ).rejects.toThrow('rede');
    expect(pendingStore.list(owner)).toMatchObject([
      { kind: 'production', intentId: id(40) },
    ]);
    await trackGateways(inner(), owner).production!.register(scope, input);
    expect(pendingStore.list(owner)).toEqual([]);
    await expect(
      trackGateways(
        inner(new ProductionRejected('recusa')),
        owner,
      ).production!.void(scope, {
        batchId: id(20),
        reason: 'erro',
        intentId: id(41),
      }),
    ).rejects.toThrow('recusa');
    expect(pendingStore.list(owner)).toEqual([]);
  });
});

describe('tela de produção', () => {
  it('filtra produções recentes pelo dia civil da unidade e permite voltar à lista', async () => {
    const user = userEvent.setup();
    panel(
      production([
        row(),
        row({
          batch_id: id(24),
          short_code: 'C-000124',
          product_name: 'Molho',
          produced_at: '2026-11-14T01:00:00Z',
        }),
      ]),
    );
    const filter = await screen.findByRole('button', { name: 'Hoje' });
    expect(screen.getByText('Molho')).toBeVisible();
    await user.click(filter);
    expect(filter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Caldo de legumes')).toBeVisible();
    expect(screen.getByText('Molho')).not.toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Todas' }));
    expect(screen.getByText('Molho')).toBeVisible();
  });

  it('registra em passos: formulário, revisão por extenso e confirmação', async () => {
    const gateway = production();
    const user = userEvent.setup();
    const { onChanged } = panel(gateway);
    expect(
      await screen.findByText('Nenhuma produção registrada.'),
    ).toBeVisible();
    const form = await fillForm(user);
    // Validade vazia por padrão, sem sugestão (D-004).
    expect(form.getByText(/não calcula nem sugere prazos/)).toBeVisible();
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    const review = within(
      screen.getByRole('region', { name: 'Revisão da produção' }),
    );
    expect(
      review.getByText(
        'Validade 16/11/2026 (segunda-feira), 2 dias depois da produção',
      ),
    ).toBeVisible();
    expect(review.getByText('Produzida por: Bruno Lima')).toBeVisible();
    expect(review.getByText('Conservação: Refrigerado')).toBeVisible();
    expect(gateway.register).not.toHaveBeenCalled();
    await user.click(
      review.getByRole('button', { name: 'Confirmar produção' }),
    );
    await waitFor(() => expect(gateway.register).toHaveBeenCalledTimes(1));
    const [, sent] = gateway.register.mock.calls[0]!;
    expect(sent).toMatchObject({
      productId: caldo.id,
      quantity: '6',
      expiryDate: '2026-11-16',
      producedAt: NOW.toISOString(),
      handledBy: cook,
      note: null,
      lateReason: null,
    });
    expect(
      await screen.findByRole('region', { name: 'Resultado da produção' }),
    ).toBeVisible();
    expect(onChanged).toHaveBeenCalled();
  });
  it('validade no mesmo dia pede confirmação a mais', async () => {
    const gateway = production();
    const user = userEvent.setup();
    panel(gateway);
    const form = await fillForm(user, { expiry: '2026-11-14' });
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar produção' });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByLabelText(SAME_DAY_TEXT));
    expect(confirm).toBeEnabled();
  });
  it('recusa na tela validade anterior à produção e horário futuro', async () => {
    const gateway = production();
    const user = userEvent.setup();
    panel(gateway);
    const form = await fillForm(user, { expiry: '2026-11-13' });
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    expect(form.getByRole('alert')).toHaveTextContent(
      'A validade não pode ser anterior à data da produção.',
    );
    const when = form.getByLabelText(`Produzida em (fuso ${timezone})`);
    // datetime-local não aceita digitação no jsdom.
    fireEvent.change(when, { target: { value: '2026-11-14T13:00' } });
    await user.clear(form.getByLabelText('Validade'));
    await user.type(form.getByLabelText('Validade'), '2026-11-16');
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    expect(form.getByRole('alert')).toHaveTextContent(
      'O horário da produção não pode estar no futuro.',
    );
    expect(gateway.register).not.toHaveBeenCalled();
  });
  it('mais de 2 horas depois exige justificativa e avisa do bloqueio', async () => {
    const gateway = production();
    const user = userEvent.setup();
    panel(gateway);
    const form = await fillForm(user);
    const when = form.getByLabelText(`Produzida em (fuso ${timezone})`);
    // datetime-local não aceita digitação no jsdom.
    fireEvent.change(when, { target: { value: '2026-11-14T08:00' } });
    expect(form.getByText(PRODUCTION_LATE_TEXT)).toBeVisible();
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    expect(form.getByRole('alert')).toHaveTextContent('exige justificativa');
    await user.type(
      form.getByLabelText('Justificativa do atraso'),
      'Registro esquecido no fim do turno',
    );
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar produção' }),
    );
    await waitFor(() => expect(gateway.register).toHaveBeenCalledTimes(1));
    expect(gateway.register.mock.calls[0]![1]).toMatchObject({
      producedAt: '2026-11-14T11:00:00.000Z',
      lateReason: 'Registro esquecido no fim do turno',
    });
    expect(
      await screen.findByText(/O lote fica bloqueado até a decisão/),
    ).toBeVisible();
  });
  it('recusa do banco volta ao formulário e permite nova tentativa; conflito pede conferência', async () => {
    const gateway = production();
    gateway.register
      .mockRejectedValueOnce(
        new ProductionRejected(
          'A validade não pode ser anterior à data do registro.',
        ),
      )
      .mockRejectedValueOnce(
        new ProductionRejected('Este identificador já foi usado.', true),
      );
    const user = userEvent.setup();
    panel(gateway);
    const form = await fillForm(user);
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar produção' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A validade não pode ser anterior à data do registro.',
    );
    const first = gateway.register.mock.calls[0]![1].intentId;
    await user.click(screen.getByRole('button', { name: 'Revisar produção' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar produção' }),
    );
    await screen.findByText('Já conferi; iniciar nova tentativa');
    // Recusa definitiva troca o identificador; o conflito trava até conferir.
    expect(gateway.register.mock.calls[1]![1].intentId).not.toBe(first);
    expect(
      screen.getByRole('button', { name: 'Revisar produção' }),
    ).toBeDisabled();
  });
  it('resultado incerto mantém o mesmo identificador para repetir', async () => {
    const gateway = production();
    gateway.register.mockRejectedValueOnce(new Error('rede'));
    const user = userEvent.setup();
    panel(gateway);
    const form = await fillForm(user);
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar produção' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Repita a mesma tentativa',
    );
    await user.click(screen.getByRole('button', { name: 'Revisar produção' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar produção' }),
    );
    await waitFor(() => expect(gateway.register).toHaveBeenCalledTimes(2));
    expect(gateway.register.mock.calls[1]![1].intentId).toBe(
      gateway.register.mock.calls[0]![1].intentId,
    );
  });
  it('anula a produção com motivo e mostra a recusa do banco', async () => {
    const gateway = production([row()]);
    gateway.void.mockRejectedValueOnce(
      new ProductionRejected(PRODUCTION_MESSAGES.at(-1)!),
    );
    const user = userEvent.setup();
    const { onChanged } = panel(gateway);
    const list = within(
      await screen.findByRole('list', { name: 'Produções recentes' }),
    );
    expect(list.getByText(/C-000123/)).toBeVisible();
    await user.click(list.getByRole('button', { name: 'Anular produção' }));
    const form = within(
      screen.getByRole('form', { name: 'Anular produção C-000123' }),
    );
    expect(form.getByText(/é definitiva/)).toBeVisible();
    await user.click(form.getByRole('button', { name: 'Confirmar anulação' }));
    expect(form.getByRole('alert')).toHaveTextContent('Escreva o motivo');
    await user.type(
      form.getByLabelText('Motivo da anulação'),
      'Validade digitada errada',
    );
    await user.click(form.getByRole('button', { name: 'Confirmar anulação' }));
    expect(await form.findByRole('alert')).toHaveTextContent(
      'Use o descarte com motivo.',
    );
    gateway.list = vi.fn().mockResolvedValue([
      row({
        voided: {
          reason: 'Validade digitada errada',
          created_at: '2026-11-14T15:00:00.000Z',
        },
      }),
    ]);
    await user.click(form.getByRole('button', { name: 'Confirmar anulação' }));
    await waitFor(() => expect(gateway.void).toHaveBeenCalledTimes(2));
    expect(gateway.void.mock.calls[1]![1]).toMatchObject({
      batchId: id(20),
      reason: 'Validade digitada errada',
    });
    expect(await screen.findByText(/ANULADA em/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Anular produção' }),
    ).not.toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });
  it('membro só consulta: sem formulário nem anulação (D-019)', async () => {
    const gateway = production([row()]);
    const { loadMembers } = panel(gateway, { canCreate: false });
    expect(
      await screen.findByText(
        'Somente o proprietário registra ou anula produção.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Registrar produção' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('form', { name: 'Registrar produção' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Anular produção' }),
    ).not.toBeInTheDocument();
    expect(loadMembers).not.toHaveBeenCalled();
  });
  it('preparação sem conservação não segue para a revisão', async () => {
    const gateway = production();
    const user = userEvent.setup();
    panel(gateway, {
      items: catalog([{ ...caldo, storage_condition: null }]),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Registrar produção' }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Registrar produção' }),
    );
    await user.selectOptions(form.getByLabelText('Preparação'), caldo.id);
    expect(form.getAllByRole('alert')[0]).toHaveTextContent(
      'Defina a conservação da preparação',
    );
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    expect(
      screen.queryByRole('region', { name: 'Revisão da produção' }),
    ).not.toBeInTheDocument();
  });
  it('oferece a etiqueta de cada produção não anulada e do resultado (fatia 7.4)', async () => {
    const labels: LabelGateway = { ensure: vi.fn(), get: vi.fn() };
    const gateway = production([
      row(),
      row({
        batch_id: id(23),
        container_id: id(24),
        short_code: 'C-000125',
        voided: { reason: 'erro', created_at: '2026-11-14T15:00:00.000Z' },
      }),
    ]);
    const user = userEvent.setup();
    panel(gateway, { labels });
    const list = within(
      await screen.findByRole('list', { name: 'Produções recentes' }),
    );
    expect(
      list.getByRole('button', { name: 'Baixar etiqueta (C-000123)' }),
    ).toBeVisible();
    expect(
      list.queryByRole('button', { name: 'Baixar etiqueta (C-000125)' }),
    ).not.toBeInTheDocument();
    const form = await fillForm(user);
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar produção' }),
    );
    const result = within(
      await screen.findByRole('region', { name: 'Resultado da produção' }),
    );
    expect(
      result.getByRole('button', { name: 'Baixar etiqueta' }),
    ).toBeVisible();
  });
});

// V5 (M5, D-063): vírgula decimal na quantidade produzida.
describe('quantidade com vírgula (V5)', () => {
  it('aceita 2,5, mostra com vírgula na revisão e envia 2.5', async () => {
    const gateway = production();
    const user = userEvent.setup();
    panel(gateway);
    const form = await fillForm(user, { quantity: '2,5' });
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    const review = within(
      screen.getByRole('region', { name: 'Revisão da produção' }),
    );
    expect(review.getByText('Quantidade: 2,5 l')).toBeVisible();
    await user.click(
      review.getByRole('button', { name: 'Confirmar produção' }),
    );
    await waitFor(() => expect(gateway.register).toHaveBeenCalledTimes(1));
    expect(gateway.register.mock.calls[0]![1]).toMatchObject({
      quantity: '2.5',
    });
  });
  it.each([
    ['1.000,50', /não use separador de milhar/],
    ['1,000.50', /não use separador de milhar/],
    ['1.500', /Quantidade ambígua: "1\.500"/],
    ['2,5,0', /não use separador de milhar/],
    ['1,2345', /com vírgula ou ponto para decimais, por exemplo 0,5/],
    ['0,0', /com vírgula ou ponto para decimais, por exemplo 0,5/],
  ])('recusa %s antes da revisão', async (typed, message) => {
    const gateway = production();
    const user = userEvent.setup();
    panel(gateway);
    const form = await fillForm(user, { quantity: typed });
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    expect(form.getByRole('alert')).toHaveTextContent(message);
    expect(
      screen.queryByRole('region', { name: 'Revisão da produção' }),
    ).toBeNull();
    expect(gateway.register).not.toHaveBeenCalled();
  });
  it('preparação em unidades recusa 2,5 como recusava 2.5', async () => {
    const gateway = production();
    const user = userEvent.setup();
    panel(gateway, {
      items: catalog([{ ...caldo, unit: 'un' as const }]),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Registrar produção' }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Registrar produção' }),
    );
    await user.selectOptions(form.getByLabelText('Preparação'), caldo.id);
    await user.type(form.getByLabelText('Quantidade produzida (un)'), '2,5');
    await user.type(form.getByLabelText('Validade'), '2026-11-16');
    await user.selectOptions(form.getByLabelText('Produzida por'), cook);
    await user.click(form.getByRole('button', { name: 'Revisar produção' }));
    expect(form.getByRole('alert')).toHaveTextContent(
      'Esta preparação é medida em unidades inteiras.',
    );
    expect(gateway.register).not.toHaveBeenCalled();
  });
});

// V5B (D-064): a lista de produções mostra a quantidade com vírgula.
describe('lista de produções (V5B)', () => {
  it('mostra 2,5 l e 1500 l, sem ponto e sem separador de milhar', async () => {
    const gateway = production([
      row({ batch_id: id(31), quantity: 2.5 }),
      row({ batch_id: id(32), quantity: 1500, short_code: 'C-000124' }),
    ]);
    panel(gateway);
    const list = await screen.findByRole('list', {
      name: /Produções recentes/,
    });
    expect(list).toHaveTextContent('C-000123 — 2,5 l');
    expect(list).toHaveTextContent('C-000124 — 1500 l');
    expect(list).not.toHaveTextContent(/\d\.\d/);
  });
});
