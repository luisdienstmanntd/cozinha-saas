import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  containerPath,
  DERIVED_DATA_MESSAGE,
  LATE_HOLD_MESSAGE,
} from '../domain/label';
import { BLOCK_TEXT } from '../../occurrences/domain/occurrence';
import { storageLabels } from '../../catalog/domain/catalog';
import type { LabelData } from '../domain/label';

// Fatia 6.7 (desenho 7.2): dois modelos de 100 × 100 mm, legíveis sem ler o QR. "Recebimento" para o
// recipiente integral e "Produto aberto" / "Produto fracionado" para o derivado. Gerar ou reimprimir
// nunca grava nada (D-003). O QR leva só a URL e o ID opaco.
const SAFE_TEXT = /[^\u0020-\u007e\u00a0-\u00ff]/u;
const pad = (value: number) => String(value).padStart(2, '0');

function day(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function zoned(iso: string, timezone: string): { date: string; time: string } {
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

function refuse(data: LabelData) {
  // Fatia 6.4: recipiente de manipulação anulada não ganha etiqueta, mesmo chamado direto.
  if (data.voided)
    throw new Error(
      'Manipulação anulada: este recipiente não vale mais e a etiqueta não pode ser gerada.',
    );
  if (data.late_hold) throw new Error(LATE_HOLD_MESSAGE);
  if (data.kind === 'derived' && !data.handling)
    throw new Error(DERIVED_DATA_MESSAGE);
}

type Page = { doc: jsPDF; right: number };
function lines(doc: jsPDF, text: string, width: number, max: number) {
  const wrapped = doc.splitTextToSize(text, width) as string[];
  if (wrapped.length > max)
    throw new Error('Conteúdo não cabe neste modelo de etiqueta.');
  return wrapped;
}

function receiptPage({ doc }: Page, data: LabelData) {
  const batch = data.batch_receipts;
  const supplier = batch.suppliers?.name ?? null;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('RECEBIMENTO', 6, 7);
  doc.setFontSize(12);
  const name = lines(doc, batch.products.name, 88, 3);
  doc.text(name, 6, 13);
  let y = 13 + name.length * 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const row = (text: string, max = 2) => {
    const wrapped = lines(doc, text, 88, max);
    doc.text(wrapped, 6, y);
    y += wrapped.length * 4;
  };
  row(`Lote: ${batch.source_code}`, 3);
  if (supplier) row(`Fornecedor: ${supplier}`);
  if (data.storage) row(`Conservação: ${storageLabels[data.storage]}`);
  y += 1;
  row(
    `Quantidade inicial: ${data.effective?.initial_quantity ?? batch.quantity} ${batch.unit} (entrada)`,
  );
  row(
    `Validade: ${batch.expiry_date} (${batch.expiry_origin === 'original' ? 'original' : 'responsável'})`,
  );
  if (y > 60) throw new Error('Conteúdo não cabe neste modelo de etiqueta.');
}

function openedPage({ doc }: Page, data: LabelData) {
  const h = data.handling!;
  const batch = data.batch_receipts;
  const when = zoned(h.handled_at, h.timezone);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(
    h.kind === 'portioning' ? 'PRODUTO FRACIONADO' : 'PRODUTO ABERTO',
    6,
    7,
  );
  doc.setFontSize(13);
  const name = lines(doc, batch.products.name, 88, 2);
  doc.text(name, 6, 13);
  let y = 13 + name.length * 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Aberto em: ${when.date} ${when.time} (${h.timezone})`, 6, y);
  y += 6;
  doc.text('VALIDADE APÓS ABERTURA', 6, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(day(h.expiry_date), 6, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`definida por ${h.handled_by_name} em ${when.date}`, 6, y);
  y += 4.5;
  doc.setFontSize(9);
  const row = (text: string, width = 88, max = 2) => {
    const wrapped = lines(doc, text, width, max);
    doc.text(wrapped, 6, y);
    y += wrapped.length * 4;
  };
  if (batch.expiry_origin === 'original')
    row(`Validade do fabricante: ${day(batch.expiry_date)}`);
  row(`Lote original: ${batch.source_code}`);
  // Abaixo da altura do QR (a partir de 61 mm) o texto fica na coluna da esquerda.
  y = Math.max(y, 61);
  row(`Conservação: ${storageLabels[h.storage]}`, 54, 1);
  row(`Manipulado por: ${h.handled_by_name}`, 54, 2);
  if (h.kind === 'portioning' && h.position)
    row(`Porção ${h.position}${h.siblings ? ` de ${h.siblings}` : ''}`, 54, 1);
  if (data.effective)
    row(
      `Quantidade na criação: ${data.effective.initial_quantity} ${batch.unit}`,
      54,
      2,
    );
  if (y > (data.hold ? 81 : 93))
    throw new Error('Conteúdo não cabe neste modelo de etiqueta.');
}

function textsOf(data: LabelData): string[] {
  return [
    data.batch_receipts.products.name,
    data.batch_receipts.source_code,
    data.batch_receipts.suppliers?.name ?? '',
    data.handling?.handled_by_name ?? '',
  ];
}

// Uma etiqueta por página, na ordem recebida. Qualquer recusa interrompe o arquivo inteiro.
export async function makeLabelsPdf(
  list: LabelData[],
  origin: string,
): Promise<Blob> {
  if (list.length === 0) throw new Error('Nenhuma etiqueta para gerar.');
  for (const data of list) refuse(data);
  const url = new URL(origin);
  if (
    url.origin !== 'http://127.0.0.1:5173' &&
    url.origin !== 'http://127.0.0.1:5174'
  )
    throw new Error('Endereço de demonstração indisponível.');
  for (const data of list)
    if (textsOf(data).some((item) => SAFE_TEXT.test(item)))
      throw new Error(
        'Nome ou lote contém caracteres não disponíveis neste modelo de PDF.',
      );
  const doc = new jsPDF({ unit: 'mm', format: [100, 100], compress: false });
  for (const [index, data] of list.entries()) {
    if (index > 0) doc.addPage([100, 100]);
    doc.setTextColor(0, 0, 0);
    if (data.kind === 'derived') openedPage({ doc, right: 94 }, data);
    else receiptPage({ doc, right: 94 }, data);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(data.short_code, 6, 95);
    doc.setFontSize(6);
    doc.text(`ID: ${data.id}`, 6, 98.5);
    const qr = await QRCode.toDataURL(
      `${url.origin}${containerPath(data.id)}`,
      { errorCorrectionLevel: 'M', margin: 2, width: 300 },
    );
    doc.addImage(qr, 'PNG', 62, 61, 30, 30);
    // Fatia 6.5b (desenho 7.2): faixa de bloqueio enquanto houver ocorrência sem decisão ou rejeitada.
    if (data.hold) {
      doc.setFillColor(0, 0, 0);
      doc.rect(6, 82, 52, 9, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      const [first, second] = BLOCK_TEXT[data.hold].split(' - ');
      doc.text(first ?? '', 8, 88);
      doc.text(second ?? '', 8 + doc.getTextWidth(`${first ?? ''}  `), 88);
      doc.setTextColor(0, 0, 0);
    }
  }
  return doc.output('blob');
}

export function makeLabelPdf(data: LabelData, origin: string): Promise<Blob> {
  return makeLabelsPdf([data], origin);
}
