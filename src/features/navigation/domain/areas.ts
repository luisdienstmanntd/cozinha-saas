// Áreas da unidade e o endereço `?unidade=…&area=…`. Só controla o que aparece; permissão continua no
// banco (RLS e funções de escrita). Nenhuma regra de negócio mora aqui. As áreas mostradas a cada
// perfil ficam em `workspaceAreas.ts`.

export const AREA_IDS = [
  'validade',
  'receber',
  'producao',
  'locais',
  'cadastros',
  'visao-geral',
  'indicadores',
  'etiquetas',
  'produtos',
  'fornecedores',
  'preparacoes',
  'config-unidade',
  'config-equipe',
  'config-organizacao',
] as const;
export type AreaId = (typeof AREA_IDS)[number];

export type Area = { id: AreaId; label: string };

export function parseArea(value: string | null): AreaId | null {
  return AREA_IDS.find((id) => id === value) ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Place = { unit: string | null; area: AreaId | null };

/** Lê `?unidade=<uuid>&area=<id>` do endereço; valor inválido vira ausente. */
export function parsePlace(search: string): Place {
  const params = new URLSearchParams(search);
  const unit = params.get('unidade');
  return {
    unit: unit && UUID.test(unit) ? unit.toLowerCase() : null,
    area: parseArea(params.get('area')),
  };
}

/**
 * Endereço com unidade e área, mantendo os demais parâmetros. V6 (D-072): `validade` (filtro da lista
 * de Validades) só acompanha a área Validades; trocar de área ou sair da unidade o remove.
 */
export function placeSearch(
  current: string,
  unit: string | null,
  area: AreaId | null,
  expiryFilter: string | null = null,
): string {
  const params = new URLSearchParams(current);
  params.delete('unidade');
  params.delete('area');
  params.delete('validade');
  if (unit) {
    params.set('unidade', unit);
    if (area) params.set('area', area);
    if (area === 'validade' && expiryFilter)
      params.set('validade', expiryFilter);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}
