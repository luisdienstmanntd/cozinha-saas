// Fatia 7.7: janela de registro da produção por preparação, no catálogo. Dados sintéticos.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogGateway } from '../application/catalogGateway';
import { createCatalogGateway } from '../data/supabaseCatalog';
import { CatalogPanel } from './CatalogPanel';

const scope = { organizationId: 'org', establishmentId: 'unit' };
const id = (n: number) =>
  `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
const caldo = {
  id: id(9),
  name: 'Caldo de legumes',
  unit: 'l' as const,
  storage_condition: 'refrigerated' as const,
  production_window_minutes: null as number | null,
};

function gateway(prep: typeof caldo) {
  return {
    list: vi.fn(async (kind: string) =>
      kind === 'preparations' ? [prep] : [],
    ),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
    setProductionWindow: vi.fn(
      async (_scope: unknown, _id: string, minutes: number | null) => minutes,
    ),
  } satisfies CatalogGateway;
}

describe('janela da preparação no catálogo', () => {
  it('mostra a janela da unidade ou a própria; só o proprietário altera', async () => {
    const own = gateway({ ...caldo, production_window_minutes: 90 });
    const { unmount } = render(
      <CatalogPanel scope={scope} gateway={own} canCreate={false} />,
    );
    const section = within(
      await screen.findByRole('region', { name: 'Preparações próprias' }),
    );
    expect(
      await section.findByText(/janela de registro: 1 hora e 30 minutos/),
    ).toBeVisible();
    expect(
      section.queryByRole('button', { name: /Janela de registro de/ }),
    ).toBeNull();
    unmount();
    const unit = gateway(caldo);
    render(<CatalogPanel scope={scope} gateway={unit} canCreate />);
    const owner = within(
      await screen.findByRole('region', { name: 'Preparações próprias' }),
    );
    expect(
      await owner.findByText(/janela de registro: a da unidade/),
    ).toBeVisible();
    expect(
      owner.getByRole('button', {
        name: 'Janela de registro de Caldo de legumes',
      }),
    ).toBeVisible();
  });
  it('define a janela com os limites, mostra a duração e avisa a tela de produção', async () => {
    const g = gateway(caldo);
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(
      <CatalogPanel
        scope={scope}
        gateway={g}
        canCreate
        onCreated={onCreated}
      />,
    );
    const section = within(
      await screen.findByRole('region', { name: 'Preparações próprias' }),
    );
    await user.click(
      await section.findByRole('button', {
        name: 'Janela de registro de Caldo de legumes',
      }),
    );
    const field = section.getByLabelText(
      'Janela de registro da produção de Caldo de legumes (minutos)',
    );
    const save = section.getByRole('button', {
      name: 'Salvar janela de Caldo de legumes',
    });
    expect(save).toBeDisabled();
    await user.type(field, '10');
    expect(save).toBeDisabled();
    await user.clear(field);
    await user.type(field, '1441');
    expect(save).toBeDisabled();
    await user.clear(field);
    await user.type(field, '240');
    expect(section.getByText(/\(4 horas\)/)).toBeVisible();
    // Sem janela própria, não há o que "voltar".
    expect(
      section.queryByRole('button', { name: /Usar a janela da unidade/ }),
    ).toBeNull();
    await user.click(save);
    await waitFor(() =>
      expect(g.setProductionWindow).toHaveBeenCalledWith(scope, caldo.id, 240),
    );
    expect(
      await section.findByText(/janela de registro: 4 horas/),
    ).toBeVisible();
    expect(onCreated).toHaveBeenCalled();
  });
  it('volta à janela da unidade e mostra a recusa do banco', async () => {
    const g = gateway({ ...caldo, production_window_minutes: 90 });
    g.setProductionWindow.mockRejectedValueOnce(
      new Error('Somente o proprietário muda a janela da preparação.'),
    );
    const user = userEvent.setup();
    render(<CatalogPanel scope={scope} gateway={g} canCreate />);
    const section = within(
      await screen.findByRole('region', { name: 'Preparações próprias' }),
    );
    await user.click(
      await section.findByRole('button', {
        name: 'Janela de registro de Caldo de legumes',
      }),
    );
    expect(
      section.getByLabelText(
        'Janela de registro da produção de Caldo de legumes (minutos)',
      ),
    ).toHaveValue('90');
    await user.click(
      section.getByRole('button', {
        name: 'Usar a janela da unidade em Caldo de legumes',
      }),
    );
    expect(await section.findByRole('alert')).toHaveTextContent(
      'Somente o proprietário muda a janela da preparação.',
    );
    await user.click(
      section.getByRole('button', {
        name: 'Usar a janela da unidade em Caldo de legumes',
      }),
    );
    await waitFor(() =>
      expect(g.setProductionWindow).toHaveBeenLastCalledWith(
        scope,
        caldo.id,
        null,
      ),
    );
    expect(
      await section.findByText(/janela de registro: a da unidade/),
    ).toBeVisible();
  });
});

describe('gateway da janela da preparação', () => {
  const real = { organizationId: id(1), establishmentId: id(2) };
  it('chama set_preparation_window com os parâmetros do banco', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 120, error: null });
    const result = await createCatalogGateway({
      rpc,
    } as unknown as SupabaseClient).setProductionWindow!(real, caldo.id, 120);
    expect(result).toBe(120);
    expect(rpc).toHaveBeenCalledWith('set_preparation_window', {
      p_organization_id: real.organizationId,
      p_establishment_id: real.establishmentId,
      p_product_id: caldo.id,
      p_minutes: 120,
    });
    const back = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(
      await createCatalogGateway({
        rpc: back,
      } as unknown as SupabaseClient).setProductionWindow!(
        real,
        caldo.id,
        null,
      ),
    ).toBeNull();
  });
  it('recusa valor fora dos limites antes de chamar o banco e traduz as recusas', async () => {
    const rpc = vi.fn();
    const g = createCatalogGateway({ rpc } as unknown as SupabaseClient);
    for (const bad of [14, 1441, 90.5])
      await expect(
        g.setProductionWindow!(real, caldo.id, bad),
      ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    const answer = (error: { code?: string; message: string }) =>
      createCatalogGateway({
        rpc: vi.fn().mockResolvedValue({ data: null, error }),
      } as unknown as SupabaseClient).setProductionWindow!(real, caldo.id, 60);
    await expect(
      answer({ code: '42501', message: 'Acesso negado.' }),
    ).rejects.toThrow('Somente o proprietário muda a janela da preparação.');
    await expect(
      answer({ code: '22023', message: 'qualquer coisa do banco' }),
    ).rejects.toThrow(/entre 15 minutos e 24 horas/);
    await expect(answer({ message: 'Failed to fetch' })).rejects.toThrow(
      'Não foi possível salvar a janela. Atualize a lista e confira.',
    );
  });
  it('lê a janela junto com a lista de preparações', async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn().mockResolvedValue({
        data: [{ ...caldo, id: id(9), production_window_minutes: 180 }],
        error: null,
      }),
    };
    const rows = await createCatalogGateway({
      from: vi.fn(() => chain),
    } as unknown as SupabaseClient).list('preparations', real);
    expect(rows[0]).toMatchObject({ production_window_minutes: 180 });
    expect(chain.select).toHaveBeenCalledWith(
      expect.stringContaining('production_window_minutes'),
    );
  });
});
