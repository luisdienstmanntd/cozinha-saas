import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BatchPanel } from './BatchPanel';
import { containerRow, fakeContainers } from '../../../test/fakeContainers';
import type { HandlingGateway } from '../../handling/application/handlingGateway';
import type { LocationGateway } from '../../locations/application/locationGateway';
import type { MovementGateway } from '../../movements/application/movementGateway';
import type { CatalogGateway } from '../../catalog/application/catalogGateway';
import { COMPACT_QUERY } from '../../../shared/ui/useCompactLayout';

// V4 (D-062): ações do cartão (M1, item 7), "Mudar de local" fecha após o sucesso (M10) e
// passo a passo da unidade vazia (D1).
const scope = { organizationId: 'org', establishmentId: 'unit' };
const user = '12345678-1234-4234-8234-123456789abc';
const place = {
  id: '62345678-1234-4234-8234-000000000001',
  name: 'Câmara fria 01',
  condition: 'refrigerated' as const,
  active: true,
};

function catalog(products = 0, suppliers = 0): CatalogGateway {
  const item = (n: number) => ({
    id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name: `Item ${n}`,
    unit: 'kg',
  });
  return {
    list: vi.fn(async (kind: string) =>
      Array.from(
        { length: kind === 'suppliers' ? suppliers : products },
        (_, i) => item(i + 1),
      ),
    ),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
  } as unknown as CatalogGateway;
}
const batches = () => ({ list: vi.fn(), receive: vi.fn() });
const handling = () =>
  ({
    members: vi
      .fn()
      .mockResolvedValue([
        { user_id: user, display_name: 'Luis', role: 'owner' },
      ]),
    setDisplayName: vi.fn(),
  }) as unknown as HandlingGateway;
function locations(): LocationGateway {
  let moved = false;
  return {
    list: vi.fn().mockResolvedValue([place]),
    currents: vi.fn(async () =>
      moved
        ? [
            {
              container_id: '30000000-0000-4000-8000-0000000000aa',
              location_id: place.id,
              location_name: place.name,
              location_condition: 'refrigerated',
              moved_at: '2026-11-16T12:00:00Z',
              handled_by_name: 'Luis',
              mismatch_confirmed: false,
            },
          ]
        : [],
    ),
    create: vi.fn(),
    setActive: vi.fn(),
    move: vi.fn(async () => {
      moved = true;
      return '92345678-1234-4234-8234-123456789abc';
    }),
  } as unknown as LocationGateway;
}

function compact(on: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: on && query === COMPACT_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}
afterEach(() => vi.unstubAllGlobals());

function renderPanel({
  rows,
  owner = true,
  products = 1,
  suppliers = 1,
  places = locations(),
  onSelect = vi.fn(),
}: {
  rows: ReturnType<typeof containerRow>[];
  owner?: boolean;
  products?: number;
  suppliers?: number;
  places?: LocationGateway;
  onSelect?: (area: string) => void;
}) {
  render(
    <BatchPanel
      scope={scope}
      timezone="America/Sao_Paulo"
      userId={user}
      canCreate={owner}
      catalog={catalog(products, suppliers)}
      batches={batches()}
      containers={fakeContainers(rows)}
      labels={{ ensure: vi.fn(), get: vi.fn() }}
      movements={{} as MovementGateway}
      handling={handling()}
      locations={places}
      areaLinks={{
        hrefFor: (area) => `?unidade=unit&area=${area}`,
        onSelect,
      }}
    />,
  );
}

const fresh = () =>
  containerRow({
    container_id: '30000000-0000-4000-8000-0000000000aa',
    product_name: 'Creme',
    expiry_date: '2099-01-10',
  });
const expired = () =>
  containerRow({
    container_id: '30000000-0000-4000-8000-0000000000bb',
    product_name: 'Frango',
    expiry_date: '2000-01-10',
  });

async function cardOf(name: string) {
  const list = await screen.findByRole('list', {
    name: 'Recipientes e validade',
  });
  return within(list).getByRole('listitem', {
    name: new RegExp(`^${name} C-`),
  });
}

describe('ações do cartão (M1 e item 7)', () => {
  it('desktop: todas as ações à vista, "Abrir / porcionar" é a principal e as outras secundárias', async () => {
    compact(false);
    renderPanel({ rows: [fresh()] });
    const card = await cardOf('Creme');
    const main = within(card).getByRole('button', {
      name: 'Abrir / porcionar',
    });
    expect(main).not.toHaveClass('secondary');
    for (const name of ['Ver ficha', 'Ver movimentações', 'Mudar de local'])
      expect(within(card).getByRole('button', { name })).toHaveClass(
        'secondary',
      );
  });

  it('PR-16: ações secundárias são botões de ícone com nome acessível e dica; a principal segue com texto', async () => {
    for (const small of [false, true]) {
      compact(small);
      renderPanel({ rows: [fresh()] });
      const card = await cardOf('Creme');
      for (const name of ['Ver ficha', 'Ver movimentações', 'Mudar de local']) {
        const icon = within(card).getByRole('button', { name });
        expect(icon).toBeVisible();
        expect(icon).toHaveClass('icon-action', 'secondary');
        expect(icon).toHaveAttribute('title', name);
        expect(icon).toHaveTextContent('');
        expect(icon.querySelector('svg')).toHaveAttribute(
          'aria-hidden',
          'true',
        );
      }
      const main = within(card).getByRole('button', {
        name: 'Abrir / porcionar',
      });
      expect(main).not.toHaveClass('icon-action');
      expect(main).toHaveTextContent('Abrir / porcionar');
      // Nada de "Mais ações": todas as ações ficam à vista, em uma só linha.
      expect(within(card).queryByText('Mais ações')).toBeNull();
      expect(card.querySelector('details')).toBeNull();
      cleanup();
    }
  });

  it('celular, vencido: aviso e "Ver movimentações" (caminho do descarte) à vista, sem ação principal', async () => {
    compact(true);
    renderPanel({ rows: [expired()] });
    const card = await cardOf('Frango');
    expect(within(card).getByText('VENCIDO - somente descarte')).toBeVisible();
    expect(
      within(card).getByRole('button', { name: 'Ver movimentações' }),
    ).toBeVisible();
    expect(
      within(card).queryByRole('button', { name: 'Abrir / porcionar' }),
    ).toBeNull();
  });

  it('celular, colaborador: só consulta', async () => {
    compact(true);
    renderPanel({ rows: [fresh()], owner: false });
    const card = await cardOf('Creme');
    expect(
      within(card)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Ver ficha', 'Ver movimentações']);
  });
});

describe('"Mudar de local" fecha após o sucesso (M10)', () => {
  it('o formulário some, o cartão mostra o novo local e a confirmação recebe o foco', async () => {
    compact(false);
    const places = locations();
    renderPanel({ rows: [fresh()], places });
    const card = await cardOf('Creme');
    await userEvent.click(
      within(card).getByRole('button', { name: 'Mudar de local' }),
    );
    const form = await within(card).findByRole('form', {
      name: 'Mudar de local',
    });
    await within(form).findByRole('option', { name: /Câmara fria 01/ });
    await userEvent.selectOptions(
      within(form).getByLabelText('Novo local'),
      place.id,
    );
    await userEvent.click(
      within(form).getByRole('button', { name: 'Registrar local' }),
    );
    const status = await within(card).findByRole('status');
    expect(status).toHaveTextContent('Local registrado.');
    await vi.waitFor(() => expect(status).toHaveFocus());
    expect(
      within(card).queryByRole('form', { name: 'Mudar de local' }),
    ).toBeNull();
    expect(await within(card).findByText('Câmara fria 01')).toBeVisible();
    expect(places.move).toHaveBeenCalledTimes(1);
  });
});

describe('primeiros passos da unidade vazia (D1)', () => {
  it('proprietário vê os passos com links para as áreas e o que já foi feito', async () => {
    compact(false);
    const onSelect = vi.fn();
    renderPanel({ rows: [], products: 2, suppliers: 0, onSelect });
    const steps = await screen.findByRole('region', {
      name: 'Primeiros passos',
    });
    // O texto anterior continua.
    expect(screen.getByText('Nenhum recipiente com saldo.')).toBeVisible();
    expect(steps).toHaveTextContent('falta fornecedor');
    const receive = within(steps).getByRole('link', {
      name: 'Registrar o primeiro recebimento',
    });
    expect(receive).toHaveAttribute('href', '?unidade=unit&area=receber');
    expect(
      within(steps).getByRole('link', {
        name: 'Criar locais de armazenamento',
      }),
    ).toHaveAttribute('href', '?unidade=unit&area=locais');
    await userEvent.click(
      within(steps).getByRole('link', {
        name: 'Cadastrar produtos e fornecedores',
      }),
    );
    expect(onSelect).toHaveBeenCalledWith('cadastros');
  });

  it('colaborador vê a versão sem ações de cadastro', async () => {
    compact(false);
    renderPanel({ rows: [], owner: false });
    const steps = await screen.findByRole('region', {
      name: 'Primeiros passos',
    });
    expect(within(steps).queryByRole('link')).toBeNull();
    expect(steps).toHaveTextContent('O proprietário cadastra produtos');
  });

  it('busca sem resultado não mostra os passos', async () => {
    compact(false);
    renderPanel({ rows: [fresh()] });
    await cardOf('Creme');
    await userEvent.type(
      screen.getByRole('searchbox', {
        name: 'Buscar por produto, lote, código ou ID do recipiente',
      }),
      'zzz',
    );
    expect(
      await screen.findByText('Nenhum recipiente corresponde à busca.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Primeiros passos' }),
    ).toBeNull();
  });
});

describe('textos recolhíveis (M11)', () => {
  it('data de referência e fuso ficam à vista; só a ordem da lista vai para "Saiba mais"', async () => {
    compact(false);
    renderPanel({ rows: [fresh()] });
    await cardOf('Creme');
    expect(screen.getByText(/^Data de referência:/)).toBeVisible();
    const order = screen.getByText(/do vencimento mais próximo para o mais/);
    expect(order).not.toBeVisible();
    await userEvent.click(
      screen.getByText('Saiba mais sobre a ordem da lista'),
    );
    expect(order).toBeVisible();
  });
});
