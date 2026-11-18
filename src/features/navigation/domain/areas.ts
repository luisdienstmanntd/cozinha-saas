// V1: a unidade aberta se divide em cinco áreas. Só controla o que aparece; permissão continua no
// banco (RLS e funções de escrita). Nenhuma regra de negócio mora aqui.

export const AREA_IDS = [
  'validade',
  'receber',
  'producao',
  'locais',
  'cadastros',
] as const;
export type AreaId = (typeof AREA_IDS)[number];

export const DEFAULT_AREA: AreaId = 'validade';

export type Area = { id: AreaId; label: string };

type Context = {
  owner: boolean;
  /** A unidade tem produção/locais disponíveis neste cliente. */
  production: boolean;
  locations: boolean;
};

/**
 * Áreas mostradas a cada perfil. O colaborador não vê Receber (só o proprietário registra
 * recebimento) nem o cadastro de produtos e fornecedores; vê Configurações para saber as regras da
 * unidade (somente leitura).
 */
export function areasFor({ owner, production, locations }: Context): Area[] {
  const areas: Area[] = [{ id: 'validade', label: 'Validade' }];
  if (owner) areas.push({ id: 'receber', label: 'Receber' });
  if (production) areas.push({ id: 'producao', label: 'Produção' });
  if (locations) areas.push({ id: 'locais', label: 'Locais' });
  // Quem só consulta vê as regras da unidade; o proprietário, o cadastro e as configurações.
  areas.push({ id: 'cadastros', label: owner ? 'Cadastros' : 'Configurações' });
  return areas;
}

export function parseArea(value: string | null): AreaId | null {
  return AREA_IDS.find((id) => id === value) ?? null;
}

/** Área pedida, se o perfil a vê; senão a inicial. */
export function resolveArea(requested: AreaId | null, areas: Area[]): AreaId {
  return areas.find((area) => area.id === requested)?.id ?? DEFAULT_AREA;
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

/** Endereço com unidade e área, mantendo os demais parâmetros. */
export function placeSearch(
  current: string,
  unit: string | null,
  area: AreaId | null,
): string {
  const params = new URLSearchParams(current);
  params.delete('unidade');
  params.delete('area');
  if (unit) {
    params.set('unidade', unit);
    if (area) params.set('area', area);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}
