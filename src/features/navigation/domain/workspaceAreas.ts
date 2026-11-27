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
  // D-079: histórico da unidade com exportação CSV, só para o proprietário (leitura filtrada pela RLS).
  if (owner) areas.splice(2, 0, { id: 'historico', label: 'Histórico' });
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
  // Senha e acesso (Minha conta): a própria senha e o segundo fator; vale para todos os perfis.
  areas.push({ id: 'config-conta', label: 'Senha e acesso' });
  return areas;
}

/**
 * PR-12 (D-078): destinos da barra inferior do celular. Quatro atalhos por perfil (Visão geral,
 * Validades, Produção ou Recebimentos, Etiquetas) e o resto em "Mais". Só reparte as áreas que
 * `workspaceAreas` já entregou ao perfil; não cria, esconde nem libera nenhuma área.
 */
export function bottomBarAreas(areas: Area[]): { bar: Area[]; more: Area[] } {
  const has = (id: AreaId) => areas.some((area) => area.id === id);
  const wanted: AreaId[] = ['visao-geral', 'validade'];
  wanted.push(has('producao') ? 'producao' : 'receber');
  wanted.push('etiquetas');
  // Perfil sem Produção nem Recebimentos (colaborador): completa com Locais, se houver.
  if (!wanted.slice(0, 3).every(has)) wanted.push('locais');
  const barIds = wanted.filter(has).slice(0, 4);
  return {
    bar: barIds.map((id) => areas.find((area) => area.id === id)!),
    more: areas.filter(({ id }) => !barIds.includes(id)),
  };
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
