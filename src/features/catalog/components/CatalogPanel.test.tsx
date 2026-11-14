import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { CatalogGateway } from '../application/catalogGateway';
import { CatalogPanel } from './CatalogPanel';

const scope = { organizationId: 'org', establishmentId: 'unit' };
const product = { id: 'p1', name: 'Arroz', unit: 'kg' as const };

it('cadastra um produto na unidade selecionada e mostra a unidade de medida', async () => {
  const gateway: CatalogGateway = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(product),
    setStorageCondition: vi.fn().mockResolvedValue('refrigerated'),
  };
  const user = userEvent.setup();
  render(<CatalogPanel scope={scope} gateway={gateway} canCreate />);
  const products = within(screen.getByRole('region', { name: 'Produtos' }));
  await products.findByText('Nenhum produto cadastrado.');
  await user.type(products.getByLabelText('Nome do produto'), ' Arroz ');
  await user.selectOptions(products.getByLabelText('Unidade de medida'), 'kg');
  // Fatia 6.5b: a conservação é escolhida no cadastro e definida uma vez, pelo banco.
  expect(
    products.getByText(/não pode ser trocada depois/, { exact: false }),
  ).toBeVisible();
  await user.selectOptions(
    products.getByLabelText('Conservação'),
    'refrigerated',
  );
  await user.click(products.getByRole('button', { name: 'Cadastrar produto' }));
  expect(await products.findByText('Arroz — kg — Refrigerado')).toBeVisible();
  expect(gateway.create).toHaveBeenCalledWith('products', scope, {
    name: 'Arroz',
    unit: 'kg',
  });
  expect(gateway.setStorageCondition).toHaveBeenCalledWith(
    scope,
    'p1',
    'refrigerated',
  );
});

it('não cadastra produto sem conservação escolhida', async () => {
  const gateway: CatalogGateway = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(product),
    setStorageCondition: vi.fn(),
  };
  const user = userEvent.setup();
  render(<CatalogPanel scope={scope} gateway={gateway} canCreate />);
  const products = within(screen.getByRole('region', { name: 'Produtos' }));
  await products.findByText('Nenhum produto cadastrado.');
  await user.type(products.getByLabelText('Nome do produto'), 'Arroz');
  await user.selectOptions(products.getByLabelText('Unidade de medida'), 'kg');
  // O select é obrigatório no navegador; o envio direto também é recusado pela validação.
  products.getByLabelText('Conservação').removeAttribute('required');
  await user.click(products.getByRole('button', { name: 'Cadastrar produto' }));
  expect(await products.findByRole('alert')).toHaveTextContent(
    'Selecione a conservação do produto.',
  );
  expect(gateway.create).not.toHaveBeenCalled();
});

it('produto cadastrado cuja conservação falhou fica marcado e pode ser definido depois', async () => {
  const gateway: CatalogGateway = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(product),
    setStorageCondition: vi
      .fn()
      .mockRejectedValueOnce(new Error('Sem conexão.'))
      .mockResolvedValueOnce('ambient'),
  };
  const user = userEvent.setup();
  render(<CatalogPanel scope={scope} gateway={gateway} canCreate />);
  const products = within(screen.getByRole('region', { name: 'Produtos' }));
  await products.findByText('Nenhum produto cadastrado.');
  await user.type(products.getByLabelText('Nome do produto'), 'Arroz');
  await user.selectOptions(products.getByLabelText('Unidade de medida'), 'kg');
  await user.selectOptions(products.getByLabelText('Conservação'), 'ambient');
  await user.click(products.getByRole('button', { name: 'Cadastrar produto' }));
  expect(await products.findByRole('alert')).toHaveTextContent(
    'Produto cadastrado, mas a conservação não foi definida: Sem conexão.',
  );
  expect(
    products.getByText(/Arroz — kg — conservação não definida/),
  ).toBeVisible();
  await user.selectOptions(
    products.getByLabelText('Conservação de Arroz'),
    'ambient',
  );
  await user.click(
    products.getByRole('button', { name: 'Definir conservação' }),
  );
  expect(await products.findByText('Arroz — kg — Ambiente')).toBeVisible();
  expect(gateway.setStorageCondition).toHaveBeenLastCalledWith(
    scope,
    'p1',
    'ambient',
  );
});

it('colaborador vê produto sem conservação, mas não define', async () => {
  render(
    <CatalogPanel
      scope={scope}
      gateway={{
        list: vi.fn(async (kind: string) =>
          kind === 'products' ? [{ ...product, storage_condition: null }] : [],
        ),
        create: vi.fn(),
        setStorageCondition: vi.fn(),
      }}
      canCreate={false}
    />,
  );
  expect(
    await screen.findByText('Arroz — kg — conservação não definida'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Definir conservação' }),
  ).not.toBeInTheDocument();
});

it('mostra falha de cadastro sem limpar o formulário nem indicar sucesso', async () => {
  const gateway: CatalogGateway = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockRejectedValue(new Error('Nome já cadastrado.')),
    setStorageCondition: vi.fn(),
  };
  const user = userEvent.setup();
  render(<CatalogPanel scope={scope} gateway={gateway} canCreate />);
  const suppliers = within(
    screen.getByRole('region', { name: 'Fornecedores' }),
  );
  await suppliers.findByText('Nenhum fornecedor cadastrado.');
  await user.type(suppliers.getByLabelText('Nome do fornecedor'), 'Horta');
  await user.click(
    suppliers.getByRole('button', { name: 'Cadastrar fornecedor' }),
  );
  expect(await suppliers.findByRole('alert')).toHaveTextContent(
    'Nome já cadastrado.',
  );
  expect(suppliers.getByLabelText('Nome do fornecedor')).toHaveValue('Horta');
  expect(
    suppliers.queryByText('Fornecedor cadastrado.'),
  ).not.toBeInTheDocument();
});

it('permite consulta e nova tentativa após erro, sem cadastro para colaborador', async () => {
  const list = vi
    .fn()
    .mockResolvedValue([])
    .mockRejectedValueOnce(new Error('Falha na consulta.'));
  const user = userEvent.setup();
  render(
    <CatalogPanel
      scope={scope}
      gateway={{ list, create: vi.fn(), setStorageCondition: vi.fn() }}
      canCreate={false}
    />,
  );
  const products = within(screen.getByRole('region', { name: 'Produtos' }));
  expect(await products.findByRole('alert')).toHaveTextContent(
    'Falha na consulta.',
  );
  await user.click(products.getByRole('button', { name: 'Tentar novamente' }));
  expect(await products.findByText('Nenhum produto cadastrado.')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /cadastrar/i }),
  ).not.toBeInTheDocument();
});

it('ignora dados de uma unidade cuja consulta termina após a troca', async () => {
  let resolveOld!: (items: (typeof product)[]) => void;
  const pending = new Promise<(typeof product)[]>((resolve) => {
    resolveOld = resolve;
  });
  const gateway: CatalogGateway = {
    list: vi.fn((kind, current) =>
      kind === 'products' && current.establishmentId === scope.establishmentId
        ? pending
        : Promise.resolve([]),
    ),
    create: vi.fn(),
    setStorageCondition: vi.fn(),
  };
  const view = render(
    <CatalogPanel scope={scope} gateway={gateway} canCreate />,
  );
  view.rerender(
    <CatalogPanel
      scope={{ ...scope, establishmentId: 'other' }}
      gateway={gateway}
      canCreate
    />,
  );
  await screen.findByText('Nenhum produto cadastrado.');
  await act(async () => {
    resolveOld([product]);
  });
  expect(screen.queryByText(/Arroz/)).not.toBeInTheDocument();
});

it('avisa quando a lista atinge o limite da API', async () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({
    id: String(i),
    name: `Item ${i}`,
  }));
  render(
    <CatalogPanel
      scope={scope}
      gateway={{
        list: vi.fn().mockResolvedValue(items),
        create: vi.fn(),
        setStorageCondition: vi.fn(),
      }}
      canCreate={false}
    />,
  );
  expect(
    (
      await screen.findAllByText(
        'A lista mostra até 1.000 itens; outros itens podem não aparecer.',
      )
    ).length,
    // Uma por seção: produtos, fornecedores e (desde a 7.3) preparações próprias.
  ).toBe(3);
});

it('cadastra preparação própria em seção separada, com unidade e conservação (fatia 7.3)', async () => {
  const caldo = { id: 'p9', name: 'Caldo de legumes', unit: 'l' as const };
  const gateway: CatalogGateway = {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(caldo),
    setStorageCondition: vi.fn().mockResolvedValue('refrigerated'),
  };
  const user = userEvent.setup();
  render(<CatalogPanel scope={scope} gateway={gateway} canCreate />);
  const section = within(
    screen.getByRole('region', { name: 'Preparações próprias' }),
  );
  await section.findByText('Nenhuma preparação cadastrada.');
  expect(gateway.list).toHaveBeenCalledWith('preparations', scope);
  // Os campos só aparecem por escolha, para não repetir os do produto na tela.
  expect(section.queryByLabelText('Unidade de medida')).not.toBeInTheDocument();
  await user.click(section.getByRole('button', { name: 'Nova preparação' }));
  await user.type(
    section.getByLabelText('Nome da preparação'),
    'Caldo de legumes',
  );
  await user.selectOptions(section.getByLabelText('Unidade de medida'), 'l');
  await user.selectOptions(
    section.getByLabelText('Conservação'),
    'refrigerated',
  );
  await user.click(
    section.getByRole('button', { name: 'Cadastrar preparação' }),
  );
  expect(
    await section.findByText('Caldo de legumes — l — Refrigerado'),
  ).toBeVisible();
  expect(section.getByRole('status')).toHaveTextContent(
    'Preparação cadastrada.',
  );
  expect(gateway.create).toHaveBeenCalledWith('preparations', scope, {
    name: 'Caldo de legumes',
    unit: 'l',
  });
});
