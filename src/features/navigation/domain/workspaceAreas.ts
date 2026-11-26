import { parseArea, type AreaId, type Area } from './areas';

export const catalogPages = {
  produtos: 'Produtos',
  fornecedores: 'Fornecedores',
  preparacoes: 'Preparações próprias',
} as const;

export function workspaceAreas(
  owner: boolean,
  production: boolean,
  locations: boolean,
): Area[] {
  const areas: Area[] = [
    { id: 'visao-geral', label: 'Visão geral' },
    { id: 'validade', label: 'Validades' },
  ];
  // D-076: indicadores da unidade, só para o proprietário (a leitura continua filtrada pela RLS).
  if (owner) areas.splice(1, 0, { id: 'indicadores', label: 'Indicadores' });
  if (owner) areas.push({ id: 'receber', label: 'Recebimentos' });
  if (production) areas.push({ id: 'producao', label: 'Produção' });
  areas.push({ id: 'etiquetas', label: 'Etiquetas' });
  if (locations) areas.push({ id: 'locais', label: 'Locais de armazenamento' });
  if (owner) {
    areas.push(
      { id: 'produtos', label: catalogPages.produtos },
      { id: 'fornecedores', label: catalogPages.fornecedores },
      { id: 'preparacoes', label: catalogPages.preparacoes },
    );
  }
  areas.push({ id: 'config-unidade', label: 'Unidade' });
  if (owner) areas.push({ id: 'config-organizacao', label: 'Organização' });
  return areas;
}

const legacy: Record<string, AreaId> = {
  '#cadastro-produtos': 'produtos',
  '#cadastro-fornecedores': 'fornecedores',
  '#cadastro-preparacoes': 'preparacoes',
  '#cadastro-configuracoes': 'config-unidade',
  '#cadastro-organizacao': 'config-organizacao',
};

export function workspacePage(
  search: string,
  hash: string,
  areas: Area[],
): AreaId {
  const requested = parseArea(new URLSearchParams(search).get('area'));
  const candidate =
    requested === 'cadastros'
      ? Object.hasOwn(legacy, hash)
        ? legacy[hash]
        : areas.some(({ id }) => id === 'produtos')
          ? 'produtos'
          : 'config-unidade'
      : requested;
  return areas.find(({ id }) => id === candidate)?.id ?? 'visao-geral';
}
