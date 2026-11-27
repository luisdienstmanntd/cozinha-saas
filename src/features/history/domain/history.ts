import { formatDateTime } from '../../../shared/format/dates';
import { formatQuantity } from '../../../shared/format/quantity';

// D-079: histórico da unidade. Só leitura: junta, numa linha do tempo, registros que o banco já
// guarda (recebimentos, produções, saídas, manipulações, mudanças de local, ocorrências e alterações
// de cadastro). Nada aqui grava, corrige ou decide; o filtro de acesso é a RLS do banco.

export const HISTORY_GROUPS = [
  'receipts',
  'productions',
  'exits',
  'handlings',
  'locations',
  'occurrences',
  'registry',
] as const;
export type HistoryGroup = (typeof HISTORY_GROUPS)[number];

export const groupLabels: Record<HistoryGroup, string> = {
  receipts: 'Recebimentos',
  productions: 'Produções',
  exits: 'Saídas',
  handlings: 'Manipulações',
  locations: 'Locais',
  occurrences: 'Ocorrências',
  registry: 'Cadastro e acesso',
};

export type HistoryEvent = {
  id: string;
  // Instante do registro (ISO), como o banco guarda.
  at: string;
  group: HistoryGroup;
  title: string;
  product: string | null;
  container: string | null;
  // Já formatada (vírgula decimal e unidade), ou nula quando o evento não tem quantidade.
  quantity: string | null;
  detail: string | null;
  reason: string | null;
  actor: string | null;
};

export const NO_ACTOR = 'Sem nome cadastrado';

export const HISTORY_PERIODS = [7, 30, 90] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];
export const DEFAULT_HISTORY_PERIOD: HistoryPeriod = 30;
export const periodLabels: Record<HistoryPeriod, string> = {
  7: 'Últimos 7 dias',
  30: 'Últimos 30 dias',
  90: 'Últimos 90 dias',
};

export function periodRange(now: Date, days: HistoryPeriod) {
  return { from: new Date(now.getTime() - days * 86_400_000), to: now };
}

export function quantityWithUnit(quantity: string | number, unit: string) {
  return `${formatQuantity(quantity)} ${unit}`;
}

// ---------- Alterações de cadastro (entity_changes) ----------
const entityLabels: Record<string, string> = {
  organization: 'da organização',
  establishment: 'da unidade',
  membership: 'de um membro',
  product: 'do produto',
};
const fieldLabels: Record<string, string> = {
  name: 'nome',
  timezone: 'fuso',
  display_name: 'nome de exibição',
  storage_condition: 'conservação',
  production_registrar: 'quem registra produção',
  production_window_minutes: 'janela de registro da produção',
  unlabeled_limit_minutes: 'tempo máximo sem etiqueta',
  portion_expiry_rule: 'validade da porção',
};
const valueLabels: Record<string, Record<string, string>> = {
  storage_condition: {
    ambient: 'Ambiente',
    refrigerated: 'Refrigerado',
    frozen: 'Congelado',
  },
  production_registrar: {
    owner: 'Só o proprietário',
    member: 'Cada colaborador registra a própria produção',
  },
  portion_expiry_rule: {
    equal: 'Igual à validade do lote',
    equal_or_less: 'Igual ou menor que a validade do lote',
  },
};

export function registryTitle(entity: string, field: string): string {
  return `Alteração ${entityLabels[entity] ?? 'do cadastro'}: ${fieldLabels[field] ?? field}`;
}

/** Valor antigo ou novo em palavras; ausente vira traço. Desconhecido volta como veio. */
export function registryValue(field: string, value: string | null): string {
  if (value === null) return '—';
  if (field.endsWith('_minutes')) return `${value} min`;
  return valueLabels[field]?.[value] ?? value;
}

/** Mais recentes primeiro; empate pelo identificador, para a ordem não mudar entre consultas. */
export function sortEvents(events: HistoryEvent[]): HistoryEvent[] {
  return [...events].sort((a, b) => {
    const diff = Date.parse(b.at) - Date.parse(a.at);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

export function filterEvents(
  events: HistoryEvent[],
  groups: ReadonlySet<HistoryGroup>,
  search: string,
): HistoryEvent[] {
  const needle = search.trim().toLocaleLowerCase('pt-BR');
  return events.filter((event) => {
    if (!groups.has(event.group)) return false;
    if (!needle) return true;
    return [
      event.title,
      event.product,
      event.container,
      event.detail,
      event.reason,
      event.actor,
    ].some((text) => text?.toLocaleLowerCase('pt-BR').includes(needle));
  });
}

// ---------- CSV ----------
// Separador ponto e vírgula, UTF-8 com marca de ordem de bytes e quebra CRLF: abre direto no Excel em
// português. Todo texto que começaria com `= + - @` (ou tabulação/retorno) ganha um apóstrofo na frente,
// para a planilha não executá-lo como fórmula (injeção de fórmula em CSV).

export const CSV_HEADER = [
  'Data e hora',
  'Instante (UTC)',
  'Tipo',
  'Evento',
  'Produto',
  'Recipiente',
  'Quantidade',
  'Detalhe',
  'Motivo ou observação',
  'Responsável',
] as const;

export function csvCell(value: string | null | undefined): string {
  let text = value ?? '';
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Marca de ordem de bytes UTF-8 (U+FEFF), para o Excel reconhecer os acentos.
const BOM = String.fromCharCode(0xfeff);

export function toCsv(events: HistoryEvent[], timezone: string): string {
  const rows = events.map((event) =>
    [
      formatDateTime(event.at, timezone),
      new Date(event.at).toISOString(),
      groupLabels[event.group],
      event.title,
      event.product,
      event.container,
      event.quantity,
      event.detail,
      event.reason,
      event.actor,
    ]
      .map(csvCell)
      .join(';'),
  );
  return `${BOM}${[CSV_HEADER.join(';'), ...rows].join('\r\n')}\r\n`;
}

/** Nome de arquivo só com letras ASCII, números e hífen; a data é a do dia no fuso da unidade. */
export function csvFilename(unitName: string, now: Date, timezone: string) {
  const slug = unitName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return `historico-${slug || 'unidade'}-${day}.csv`;
}
