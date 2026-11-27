import {
  DERIVED_DATA_MESSAGE,
  PRODUCED_LABEL_MESSAGE,
  PRODUCTION_HOLD_MESSAGE,
  PRODUCTION_VOIDED_MESSAGE,
  LATE_HOLD_MESSAGE,
} from '../domain/label';
import type { LabelData } from '../domain/label';
import { BLOCK_TEXT } from '../../occurrences/domain/occurrence';
import { storageLabels } from '../../catalog/domain/catalog';
import { formatQuantity } from '../../../shared/format/quantity';
import { isAuthorizedOrigin } from './labelOrigin';

// Fonte única do texto da etiqueta (prévia da etiqueta, M9 do diagnóstico de 26/11/2026). O PDF
// (`pdf.ts`) e a prévia em tela (`LabelPreview.tsx`) leem os mesmos textos daqui, para que a prévia
// nunca mostre uma coisa e o arquivo imprima outra. Este arquivo não desenha nada e não importa o
// gerador de PDF; só monta textos e recusa o que o PDF recusa. Os textos são os mesmos de antes.
const SAFE_TEXT = /[^\u0020-\u007e\u00a0-\u00ff]/u;
const pad = (value: number) => String(value).padStart(2, '0');

export function day(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
export function zoned(
  iso: string,
  timezone: string,
): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.day}/${parts.month}/${parts.year}`,
    time: `${pad(Number(parts.hour))}:${pad(Number(parts.minute))}`,
  };
}

export function refuse(data: LabelData) {
  // Fatia 6.4: recipiente de manipulação anulada não ganha etiqueta, mesmo chamado direto.
  if (data.voided)
    throw new Error(
      'Manipulação anulada: este recipiente não vale mais e a etiqueta não pode ser gerada.',
    );
  // Fatia 7.4: lote produzido exige os dados da produção; anulado ou tardio sem liberação não sai.
  if (data.batch_receipts.source_code === null || data.production) {
    if (!data.production) throw new Error(PRODUCED_LABEL_MESSAGE);
    if (data.production.voided) throw new Error(PRODUCTION_VOIDED_MESSAGE);
    if (data.production_hold) throw new Error(PRODUCTION_HOLD_MESSAGE);
    if (!(data.handling?.storage ?? data.storage))
      throw new Error(PRODUCED_LABEL_MESSAGE);
  }
  if (data.late_hold) throw new Error(LATE_HOLD_MESSAGE);
  if (data.kind === 'derived' && !data.handling)
    throw new Error(DERIVED_DATA_MESSAGE);
}

function textsOf(data: LabelData): string[] {
  return [
    data.batch_receipts.products.name,
    data.batch_receipts.source_code ?? '',
    data.batch_receipts.suppliers?.name ?? '',
    data.handling?.handled_by_name ?? '',
    data.production?.handled_by_name ?? '',
  ];
}

// Mesmas recusas do PDF, na mesma ordem: dados, endereço do QR e caracteres sem suporte.
export function validateLabels(list: LabelData[], origin: string): URL {
  if (list.length === 0) throw new Error('Nenhuma etiqueta para gerar.');
  for (const data of list) refuse(data);
  const url = new URL(origin);
  if (!isAuthorizedOrigin(url.origin))
    throw new Error('Endereço não autorizado para o QR da etiqueta.');
  for (const data of list)
    if (textsOf(data).some((item) => SAFE_TEXT.test(item)))
      throw new Error(
        'Nome ou lote contém caracteres não disponíveis neste modelo de PDF.',
      );
  return url;
}

export type LabelBlock = { first: string; second: string };

export type LabelContent = {
  model: 'receipt' | 'opened' | 'preparation';
  title: string;
  name: string;
  // Validade em destaque (modelos de preparação e de produto aberto).
  validity?: { caption: string; date: string; note: string };
  // Linhas de texto do corpo, na ordem de leitura; `side` = coluna ao lado do QR.
  rows: { key: string; text: string; side: boolean }[];
  shortCode: string;
  id: string;
  hold: LabelBlock | null;
};

const portion = (position: number | null, siblings: number | null) =>
  `Porção ${position}${siblings ? ` de ${siblings}` : ''}`;

function holdOf(data: LabelData): LabelBlock | null {
  if (!data.hold) return null;
  const [first, second] = BLOCK_TEXT[data.hold].split(' - ');
  return { first: first ?? '', second: second ?? '' };
}

export function receiptContent(data: LabelData): LabelContent {
  const batch = data.batch_receipts;
  const supplier = batch.suppliers?.name ?? null;
  const rows: LabelContent['rows'] = [
    { key: 'lot', text: `Lote: ${batch.source_code}`, side: false },
  ];
  if (supplier)
    rows.push({
      key: 'supplier',
      text: `Fornecedor: ${supplier}`,
      side: false,
    });
  if (data.storage)
    rows.push({
      key: 'storage',
      text: `Conservação: ${storageLabels[data.storage]}`,
      side: false,
    });
  rows.push(
    {
      key: 'quantity',
      text: `Quantidade inicial: ${formatQuantity(data.effective?.initial_quantity ?? batch.quantity)} ${batch.unit} (entrada)`,
      side: false,
    },
    {
      key: 'expiry',
      text: `Validade: ${day(batch.expiry_date)} (${batch.expiry_origin === 'original' ? 'original' : 'responsável'})`,
      side: false,
    },
  );
  return {
    model: 'receipt',
    title: 'RECEBIMENTO',
    name: batch.products.name,
    rows,
    shortCode: data.short_code,
    id: data.id,
    hold: holdOf(data),
  };
}

export function openedContent(data: LabelData): LabelContent {
  const h = data.handling!;
  const batch = data.batch_receipts;
  const when = zoned(h.handled_at, h.timezone);
  const rows: LabelContent['rows'] = [
    {
      key: 'openedAt',
      text: `Aberto em: ${when.date} ${when.time} (${h.timezone})`,
      side: false,
    },
  ];
  if (batch.expiry_origin === 'original')
    rows.push({
      key: 'manufacturer',
      text: `Validade do fabricante: ${day(batch.expiry_date)}`,
      side: false,
    });
  rows.push(
    { key: 'lot', text: `Lote original: ${batch.source_code}`, side: false },
    {
      key: 'storage',
      text: `Conservação: ${storageLabels[h.storage]}`,
      side: true,
    },
    {
      key: 'handledBy',
      text: `Manipulado por: ${h.handled_by_name}`,
      side: true,
    },
  );
  if (h.kind === 'portioning' && h.position)
    rows.push({
      key: 'portion',
      text: portion(h.position, h.siblings),
      side: true,
    });
  if (data.effective)
    rows.push({
      key: 'quantity',
      text: `Quantidade na criação: ${formatQuantity(data.effective.initial_quantity)} ${batch.unit}`,
      side: true,
    });
  return {
    model: 'opened',
    title: h.kind === 'portioning' ? 'PRODUTO FRACIONADO' : 'PRODUTO ABERTO',
    name: batch.products.name,
    validity: {
      caption: 'VALIDADE APÓS ABERTURA',
      date: day(h.expiry_date),
      note: `definida por ${h.handled_by_name} em ${when.date}`,
    },
    rows,
    shortCode: data.short_code,
    id: data.id,
    hold: holdOf(data),
  };
}

export function preparationContent(data: LabelData): LabelContent {
  const p = data.production!;
  const h = data.handling;
  const batch = data.batch_receipts;
  const made = zoned(p.produced_at, p.timezone);
  const storage = (h?.storage ?? data.storage)!;
  const expiry = h?.expiry_date ?? batch.expiry_date;
  const shownQuantity = formatQuantity(
    data.effective?.initial_quantity ?? batch.quantity,
  );
  const rows: LabelContent['rows'] = [
    {
      key: 'madeAt',
      text: `Produzido em: ${made.date} ${made.time} (${p.timezone})`,
      side: false,
    },
    { key: 'madeBy', text: `Produzido por: ${p.handled_by_name}`, side: false },
    {
      key: 'storage',
      text: `Conservação: ${storageLabels[storage]}`,
      side: true,
    },
    {
      key: 'quantity',
      text: h
        ? `Quantidade da porção: ${shownQuantity} ${batch.unit}`
        : `Quantidade produzida: ${shownQuantity} ${batch.unit}`,
      side: true,
    },
  ];
  if (h?.kind === 'portioning' && h.position)
    rows.push({
      key: 'portion',
      text: portion(h.position, h.siblings),
      side: true,
    });
  return {
    model: 'preparation',
    title: 'PREPARAÇÃO PRÓPRIA',
    name: batch.products.name,
    validity: {
      caption: 'VALIDADE',
      date: day(expiry),
      note: 'Validade informada pelo responsável',
    },
    rows,
    shortCode: data.short_code,
    id: data.id,
    hold: holdOf(data),
  };
}

// Mesma escolha de modelo do PDF.
export function labelContent(data: LabelData): LabelContent {
  if (data.production) return preparationContent(data);
  if (data.kind === 'derived') return openedContent(data);
  return receiptContent(data);
}
