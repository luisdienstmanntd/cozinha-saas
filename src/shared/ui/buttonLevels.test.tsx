import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { VoidProduction } from '../../features/production/components/VoidProduction';
import { VoidHandling } from '../../features/handling/components/VoidHandling';
import { LocationsPanel } from '../../features/locations/components/LocationsPanel';
import type { ProductionGateway } from '../../features/production/application/productionGateway';
import type { HandlingGateway } from '../../features/handling/application/handlingGateway';
import type { LocationGateway } from '../../features/locations/application/locationGateway';
import { MoreInfo } from './MoreInfo';

// V4 (M1, D-062): ações de risco em contorno vermelho; confirmação de risco em vermelho cheio;
// cancelar e fechar são secundários. O texto do botão não muda.
const scope = { organizationId: 'org', establishmentId: 'unit' };

it('anular produção: abrir é de risco, confirmar é risco cheio, cancelar é secundário', async () => {
  render(
    <VoidProduction
      scope={scope}
      batchId="20000000-0000-4000-8000-000000000001"
      label="Caldo"
      gateway={{} as ProductionGateway}
      onVoided={vi.fn()}
    />,
  );
  const open = screen.getByRole('button', { name: 'Anular produção' });
  expect(open).toHaveClass('risk');
  await userEvent.click(open);
  expect(
    screen.getByRole('button', { name: 'Confirmar anulação' }),
  ).toHaveClass('risk-confirm');
  expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass(
    'secondary',
  );
});

it('anular manipulação: abrir é de risco, confirmar é risco cheio, cancelar é secundário', async () => {
  render(
    <VoidHandling
      scope={scope}
      handlingId="50000000-0000-4000-8000-000000000001"
      gateway={{} as HandlingGateway}
      onVoided={vi.fn()}
    />,
  );
  const open = screen.getByRole('button', { name: 'Anular manipulação' });
  expect(open).toHaveClass('risk');
  await userEvent.click(open);
  expect(
    screen.getByRole('button', { name: 'Confirmar anulação' }),
  ).toHaveClass('risk-confirm');
  expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass(
    'secondary',
  );
});

it('desativar local é de risco e reativar não; rótulo curto com o nome acessível completo (D3)', async () => {
  const gateway = {
    list: vi.fn().mockResolvedValue([
      {
        id: '62345678-1234-4234-8234-000000000001',
        name: 'Câmara fria 01',
        condition: 'refrigerated',
        active: true,
      },
      {
        id: '62345678-1234-4234-8234-000000000002',
        name: 'Freezer 02',
        condition: 'frozen',
        active: false,
      },
    ]),
  } as unknown as LocationGateway;
  render(<LocationsPanel scope={scope} gateway={gateway} canManage />);
  const off = await screen.findByRole('button', {
    name: 'Desativar Câmara fria 01',
  });
  expect(off).toHaveClass('risk');
  expect(off).toHaveTextContent(/^Desativar$/);
  const on = screen.getByRole('button', { name: 'Reativar Freezer 02' });
  expect(on).not.toHaveClass('risk');
  expect(on).toHaveTextContent(/^Reativar$/);
});

it('"Saiba mais" usa detalhes nativos: o conteúdo fica no documento e abre ao toque', async () => {
  render(
    <MoreInfo>
      <p>Orientação geral</p>
    </MoreInfo>,
  );
  const text = screen.getByText('Orientação geral');
  expect(text).not.toBeVisible();
  await userEvent.click(screen.getByText('Saiba mais'));
  expect(text).toBeVisible();
});

it('descartar alimento: a confirmação da saída fica em risco cheio; consumo continua principal', async () => {
  sessionStorage.clear();
  const { MovementPanel } =
    await import('../../features/movements/components/MovementPanel');
  const user = userEvent.setup();
  const gateway = {
    list: vi.fn().mockResolvedValue([]),
    record: vi.fn(),
  };
  const batch = {
    id: 'batch',
    productName: 'Arroz',
    sourceCode: 'L1',
    quantity: 1,
    unit: 'kg',
  };
  const { unmount } = render(
    <MovementPanel
      scope={scope}
      userId="user"
      batch={batch}
      canCreate
      gateway={gateway}
    />,
  );
  await screen.findByText(/Saldo registrado: 1 kg/);
  await user.selectOptions(screen.getByLabelText('Tipo de saída'), 'discard');
  await user.type(screen.getByLabelText('Quantidade da saída'), '0.5');
  await user.type(screen.getByLabelText('Motivo'), 'estragado');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  expect(screen.getByRole('button', { name: 'Confirmar saída' })).toHaveClass(
    'risk-confirm',
  );
  expect(
    screen.getByRole('button', { name: 'Corrigir antes de enviar' }),
  ).toHaveClass('secondary');
  await user.click(
    screen.getByRole('button', { name: 'Corrigir antes de enviar' }),
  );
  unmount();
  sessionStorage.clear();
  render(
    <MovementPanel
      scope={scope}
      userId="user"
      batch={batch}
      canCreate
      gateway={gateway}
    />,
  );
  await screen.findByText(/Saldo registrado: 1 kg/);
  await user.type(screen.getByLabelText('Quantidade da saída'), '0.5');
  await user.click(screen.getByRole('button', { name: 'Registrar saída' }));
  expect(
    screen.getByRole('button', { name: 'Confirmar saída' }),
  ).not.toHaveClass('risk-confirm');
  expect(gateway.record).not.toHaveBeenCalled();
});
