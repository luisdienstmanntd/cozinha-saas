import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { HandlingForm } from './HandlingForm';
import { LabelView } from '../../labels/components/LabelView';
import { makeLabelPdf } from '../../labels/application/pdf';
import { HandlingRejected } from '../application/handlingGateway';
import type { HandlingGateway } from '../application/handlingGateway';
import type { Family, HandlingContext } from '../domain/family';

const ids = {
  org: '12345678-1234-4234-8234-123456789abc',
  est: '22345678-1234-4234-8234-123456789abc',
  box: '32345678-1234-4234-8234-123456789abc',
  child: '42345678-1234-4234-8234-123456789abc',
  user: '52345678-1234-4234-8234-123456789abc',
  handling: '62345678-1234-4234-8234-123456789abc',
};
const scope = { organizationId: ids.org, establishmentId: ids.est };
const context: HandlingContext = {
  container_id: ids.box,
  short_code: 'C-000001',
  kind: 'integral',
  product_name: 'Arroz',
  unit: 'kg',
  source_code: '0001',
  expiry_date: '2030-01-01',
  balance: 10,
  timezone: 'America/Sao_Paulo',
  storage: 'ambient',
  block: null,
};
function gateway(overrides: Partial<HandlingGateway> = {}): HandlingGateway {
  return {
    context: vi.fn().mockResolvedValue(context),
    members: vi
      .fn()
      .mockResolvedValue([
        { user_id: ids.user, display_name: 'Ana', role: 'owner' },
      ]),
    setDisplayName: vi.fn(),
    handle: vi.fn().mockResolvedValue(ids.handling),
    created: vi.fn(),
    family: vi.fn(),
    void: vi.fn(),
    ...overrides,
  };
}

async function fillOpening(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Quantidade aberta (kg)'), '4');
  await user.click(screen.getByLabelText('Sim, continua fechado'));
  await user.type(
    screen.getByLabelText('Validade após a abertura'),
    '2026-12-01',
  );
}

it('bloqueio mostra o motivo e não o formulário', async () => {
  render(
    <HandlingForm
      scope={scope}
      containerId={ids.box}
      userId={ids.user}
      gateway={gateway({
        context: vi.fn().mockResolvedValue({ ...context, block: 'pending' }),
      })}
      onClose={vi.fn()}
    />,
  );
  expect(
    await screen.findByText(/BLOQUEADO - aguardando decisão/),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Revisar registro' })).toBeNull();
});

it('excesso de saldo é recusado antes de enviar e nada é calculado de prazo', async () => {
  const user = userEvent.setup();
  const gw = gateway();
  render(
    <HandlingForm
      scope={scope}
      containerId={ids.box}
      userId={ids.user}
      gateway={gw}
      onClose={vi.fn()}
    />,
  );
  await user.type(await screen.findByLabelText('Quantidade aberta (kg)'), '11');
  expect(screen.getByText(/excede o saldo registrado/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Revisar registro' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Quantidade excede saldo registrado.',
  );
  expect(screen.getByLabelText('Validade após a abertura')).toHaveValue('');
  expect(gw.handle).not.toHaveBeenCalled();
});

it('revisa, confirma uma vez e mostra o resultado com anulação', async () => {
  const user = userEvent.setup();
  const gw = gateway({
    created: vi.fn().mockResolvedValue({
      handling: {
        id: ids.handling,
        source_container_id: ids.box,
        kind: 'opening',
        expiry_date: '2026-12-01',
        storage: 'ambient',
        handled_at: '2026-11-13T12:00:00Z',
        handled_by_name: 'Ana',
        remainder: 'sealed',
        remainder_quantity: 6,
        timezone: 'America/Sao_Paulo',
      },
      voided: null,
      children: [
        {
          id: ids.child,
          short_code: 'C-000002',
          position: null,
          initial_quantity: 4,
          balance: 4,
        },
      ],
    }),
  });
  render(
    <HandlingForm
      scope={scope}
      containerId={ids.box}
      userId={ids.user}
      gateway={gw}
      onClose={vi.fn()}
    />,
  );
  await fillOpening(user);
  await user.click(screen.getByRole('button', { name: 'Revisar registro' }));
  expect(await screen.findByText('Manipulado por: Ana')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Confirmar registro' }));
  expect(await screen.findByText(/Sobra de 6 kg segue fechada/)).toBeVisible();
  expect(gw.handle).toHaveBeenCalledTimes(1);
  expect(vi.mocked(gw.handle).mock.calls[0]![1]).toMatchObject({
    kind: 'opening',
    quantities: ['4'],
    remainder: 'sealed',
    expiryDate: '2026-12-01',
    handledBy: ids.user,
  });
  expect(
    screen.getByRole('button', { name: 'Anular manipulação' }),
  ).toBeVisible();
});

it('recusa do banco aparece e a mesma tentativa só vira nova depois de recusa definitiva', async () => {
  const user = userEvent.setup();
  const handle = vi
    .fn()
    .mockRejectedValueOnce(
      new HandlingRejected('Quantidade excede saldo registrado.'),
    )
    .mockRejectedValueOnce(
      new HandlingRejected('Identificador já utilizado.', true),
    );
  render(
    <HandlingForm
      scope={scope}
      containerId={ids.box}
      userId={ids.user}
      gateway={gateway({ handle })}
      onClose={vi.fn()}
    />,
  );
  await fillOpening(user);
  await user.click(screen.getByRole('button', { name: 'Revisar registro' }));
  await user.click(
    await screen.findByRole('button', { name: 'Confirmar registro' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Quantidade excede saldo registrado.',
  );
  await user.click(screen.getByRole('button', { name: 'Revisar registro' }));
  await user.click(
    await screen.findByRole('button', { name: 'Confirmar registro' }),
  );
  expect(
    await screen.findByRole('button', {
      name: 'Já conferi; iniciar nova tentativa',
    }),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Revisar registro' }),
  ).toBeDisabled();
  const first = handle.mock.calls[0]![1].intentId;
  const second = handle.mock.calls[1]![1].intentId;
  expect(second).not.toBe(first);
});

it('origem derivada só oferece incluir como porção ou descartar', async () => {
  const user = userEvent.setup();
  render(
    <HandlingForm
      scope={scope}
      containerId={ids.box}
      userId={ids.user}
      gateway={gateway({
        context: vi.fn().mockResolvedValue({ ...context, kind: 'derived' }),
      })}
      onClose={vi.fn()}
    />,
  );
  await user.click(await screen.findByLabelText('Dividir em porções'));
  await user.type(screen.getByLabelText('Porção 1 (kg)'), '3');
  await user.type(screen.getByLabelText('Porção 2 (kg)'), '3');
  expect(screen.queryByLabelText('Sim, continua fechado')).toBeNull();
  expect(screen.getByLabelText('Incluir como porção')).toBeVisible();
  expect(screen.getByLabelText('Descartar')).toBeVisible();
});

vi.mock('../../labels/application/pdf', () => ({
  makeLabelPdf: vi.fn(),
}));

const labelData = {
  id: ids.child,
  short_code: 'C-000002',
  balance: 4,
  kind: 'derived' as const,
  organization_id: ids.org,
  establishment_id: ids.est,
  effective: {
    expiry_date: '2026-12-01',
    expiry_origin: 'handling' as const,
    initial_quantity: 4,
  },
  batch_receipts: {
    source_code: '0001',
    quantity: 10,
    unit: 'kg',
    expiry_date: '2030-01-01',
    expiry_origin: 'original' as const,
    products: { name: 'Arroz' },
  },
};
const handlingRow = {
  id: ids.handling,
  source_container_id: ids.box,
  kind: 'opening' as const,
  expiry_date: '2026-12-01',
  storage: 'ambient' as const,
  handled_at: '2026-11-13T12:00:00Z',
  handled_by_name: 'Ana',
  remainder: 'sealed' as const,
  remainder_quantity: 6,
  timezone: 'America/Sao_Paulo',
};
const derivedFamily: Family = {
  created: {
    handling: handlingRow,
    voided: null,
    parent: { id: ids.box, short_code: 'C-000001' },
    position: null,
    siblings: 1,
  },
  openings: [],
  partial: false,
};

it('derivado mostra origem, validade efetiva e gera a etiqueta de produto aberto', async () => {
  const user = userEvent.setup();
  const open = vi.fn();
  render(
    <LabelView
      id={ids.child}
      gateway={{ ensure: vi.fn(), get: vi.fn().mockResolvedValue(labelData) }}
      handling={gateway({ family: vi.fn().mockResolvedValue(derivedFamily) })}
      canHandle={() => true}
      userId={ids.user}
      onOpenContainer={open}
    />,
  );
  expect(
    await screen.findByText(/validade 2026-12-01 \(após manipulação\)/),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Gerar etiqueta PDF' }),
  ).toBeVisible();
  await user.click(
    await screen.findByRole('button', { name: 'Abrir C-000001' }),
  );
  expect(open).toHaveBeenCalledWith(ids.box);
  expect(
    screen.getByRole('button', { name: 'Anular manipulação' }),
  ).toBeVisible();
  // Gerar a etiqueta só acontece quando alguém pede.
  expect(makeLabelPdf).not.toHaveBeenCalled();
});

it('quem não é proprietário vê a origem sem ações; anulada é informada', async () => {
  const voided: Family = {
    ...derivedFamily,
    created: {
      ...derivedFamily.created!,
      voided: {
        reason: 'Erro de lançamento',
        created_at: '2026-11-13T13:00:00Z',
      },
    },
  };
  render(
    <LabelView
      id={ids.child}
      gateway={{
        ensure: vi.fn(),
        get: vi.fn().mockResolvedValue({ ...labelData, balance: 0 }),
      }}
      handling={gateway({ family: vi.fn().mockResolvedValue(voided) })}
      canHandle={() => false}
      userId={ids.user}
    />,
  );
  const section = await screen.findByRole('region', {
    name: 'Origem e derivados',
  });
  expect(
    await within(section).findByText(/Manipulação anulada em/),
  ).toBeVisible();
  expect(section).toHaveTextContent('Erro de lançamento');
  expect(
    within(section).queryByRole('button', {
      name: /Anular|Abrir \/ porcionar/,
    }),
  ).toBeNull();
  expect(section).toHaveTextContent(
    'Somente o proprietário abre, porciona ou anula.',
  );
});

it('origem aberta avisa para usar a etiqueta nova', async () => {
  const family: Family = {
    created: null,
    partial: false,
    openings: [
      {
        handling: handlingRow,
        voided: null,
        children: [
          {
            id: ids.child,
            short_code: 'C-000002',
            position: null,
            initial_quantity: 4,
            balance: 4,
          },
        ],
      },
    ],
  };
  render(
    <LabelView
      id={ids.box}
      gateway={{
        ensure: vi.fn(),
        get: vi.fn().mockResolvedValue({
          ...labelData,
          id: ids.box,
          kind: 'integral',
          balance: 6,
        }),
      }}
      handling={gateway({ family: vi.fn().mockResolvedValue(family) })}
      canHandle={() => true}
      userId={ids.user}
    />,
  );
  expect(await screen.findByText(/Use a etiqueta nova/)).toBeVisible();
  expect(screen.getByText(/sobra de 6 kg segue fechada/)).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Abrir / porcionar' }),
  ).toBeVisible();
});

// Fatia 7.5: preparação própria só é porcionada, e a porção leva a validade do lote (decisão B).
it('preparação própria: só porcionar, com a validade do lote e sem campo de data', async () => {
  const user = userEvent.setup();
  const caldo: HandlingContext = {
    ...context,
    product_name: 'Caldo de legumes',
    unit: 'l',
    source_code: null,
    expiry_date: '2030-01-03',
    balance: 6,
    storage: 'refrigerated',
  };
  const gw = gateway({
    context: vi.fn().mockResolvedValue(caldo),
    created: vi.fn().mockResolvedValue({
      handling: {
        id: ids.handling,
        source_container_id: ids.box,
        kind: 'portioning',
        expiry_date: '2030-01-03',
        storage: 'refrigerated',
        handled_at: '2026-11-13T12:00:00Z',
        handled_by_name: 'Ana',
        remainder: 'none',
        remainder_quantity: 0,
        timezone: 'America/Sao_Paulo',
      },
      voided: null,
      children: [],
    }),
  });
  render(
    <HandlingForm
      scope={scope}
      containerId={ids.box}
      userId={ids.user}
      gateway={gw}
      onClose={vi.fn()}
    />,
  );
  expect(
    await screen.findByText(
      'Preparação própria não é aberta: divida em porções.',
    ),
  ).toBeVisible();
  expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(
    'Porcionar C-000001',
  );
  expect(screen.queryByLabelText('Abrir embalagem')).not.toBeVisible();
  expect(
    screen.queryByLabelText('Validade após a abertura'),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Validade da porção: 03\/01\/2030/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Dividir igualmente' }));
  await user.click(screen.getByRole('button', { name: 'Revisar registro' }));
  expect(
    await screen.findByText('Validade da porção: 03/01/2030 (a mesma do lote)'),
  ).toBeVisible();
  expect(screen.getByText(/Porcionado em:/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Confirmar registro' }));
  expect(vi.mocked(gw.handle).mock.calls[0]![1]).toMatchObject({
    kind: 'portioning',
    quantities: ['3', '3'],
    expiryDate: '2030-01-03',
    remainder: 'none',
  });
});

it('preparação própria: sobra fica no recipiente da produção', async () => {
  const user = userEvent.setup();
  render(
    <HandlingForm
      scope={scope}
      containerId={ids.box}
      userId={ids.user}
      gateway={gateway({
        context: vi.fn().mockResolvedValue({
          ...context,
          source_code: null,
          unit: 'l',
          balance: 6,
        }),
      })}
      onClose={vi.fn()}
    />,
  );
  await user.type(await screen.findByLabelText('Porção 1 (l)'), '1');
  await user.type(screen.getByLabelText('Porção 2 (l)'), '1');
  expect(
    screen.getByText('O restante continua no recipiente da produção?'),
  ).toBeVisible();
  expect(screen.getByLabelText('Sim, continua no recipiente')).toBeVisible();
});
