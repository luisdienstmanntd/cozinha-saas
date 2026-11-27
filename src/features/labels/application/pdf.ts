import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { containerPath } from '../domain/label';
import type { LabelData } from '../domain/label';
import {
  labelContent,
  openedContent,
  preparationContent,
  receiptContent,
  validateLabels,
} from './labelContent';
import type { LabelContent } from './labelContent';

// Fatia 7.4 (desenho da Fase 7, seção 5.2): terceiro modelo, "Preparação própria", para o integral e as
// porções de um lote produzido pela cozinha. Nenhum texto afirma conformidade (teste 16).
// Fatia 6.7 (desenho 7.2): dois modelos de 100 × 100 mm, legíveis sem ler o QR. "Recebimento" para o
// recipiente integral e "Produto aberto" / "Produto fracionado" para o derivado. Gerar ou reimprimir
// nunca grava nada (D-003). O QR leva só a URL e o ID opaco.
const text = (c: LabelContent, key: string) =>
  c.rows.find((row) => row.key === key)?.text;
type Page = { doc: jsPDF; right: number };
function lines(doc: jsPDF, value: string, width: number, max: number) {
  const wrapped = doc.splitTextToSize(value, width) as string[];
  if (wrapped.length > max)
    throw new Error('Conteúdo não cabe neste modelo de etiqueta.');
  return wrapped;
}

// Ordem da seção 5.2: nome (maior texto), VALIDADE em destaque, produzido em, produzido por,
// conservação, quantidade (e "porção X de N"), "Validade informada pelo responsável", código e QR.
// Os textos vêm de `labelContent.ts` (a mesma fonte da prévia em tela); aqui só ficam fonte e posição.
function preparationPage({ doc }: Page, data: LabelData) {
  const c = preparationContent(data);
  const v = c.validity!;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(c.title, 6, 7);
  // O nome é o maior texto (16 pt); a validade vem logo abaixo, em negrito (15 pt).
  doc.setFontSize(16);
  const name = lines(doc, c.name, 88, 3);
  doc.text(name, 6, 14, { lineHeightFactor: 1.15 });
  let y = 14 + name.length * 6.5;
  doc.setFontSize(9);
  doc.text(v.caption, 6, y);
  y += 6.5;
  doc.setFontSize(15);
  doc.text(v.date, 6, y);
  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(v.note, 6, y);
  y += 5;
  doc.setFontSize(9);
  const row = (value: string, width = 88, max = 2) => {
    const wrapped = lines(doc, value, width, max);
    doc.text(wrapped, 6, y);
    y += wrapped.length * 4;
  };
  row(text(c, 'madeAt')!);
  row(text(c, 'madeBy')!);
  // Abaixo da altura do QR (a partir de 61 mm) o texto fica na coluna da esquerda.
  y = Math.max(y, 61);
  row(text(c, 'storage')!, 54, 1);
  row(text(c, 'quantity')!, 54, 2);
  if (text(c, 'portion')) row(text(c, 'portion')!, 54, 1);
  if (y > (data.hold ? 81 : 93))
    throw new Error('Conteúdo não cabe neste modelo de etiqueta.');
}

function receiptPage({ doc }: Page, data: LabelData) {
  const c = receiptContent(data);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(c.title, 6, 7);
  doc.setFontSize(12);
  const name = lines(doc, c.name, 88, 3);
  doc.text(name, 6, 13);
  let y = 13 + name.length * 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const row = (value: string, max = 2) => {
    const wrapped = lines(doc, value, 88, max);
    doc.text(wrapped, 6, y);
    y += wrapped.length * 4;
  };
  for (const item of c.rows) {
    if (item.key === 'quantity') y += 1;
    row(item.text, item.key === 'lot' ? 3 : 2);
  }
  if (y > 60) throw new Error('Conteúdo não cabe neste modelo de etiqueta.');
}

function openedPage({ doc }: Page, data: LabelData) {
  const c = openedContent(data);
  const v = c.validity!;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(c.title, 6, 7);
  doc.setFontSize(13);
  const name = lines(doc, c.name, 88, 2);
  doc.text(name, 6, 13);
  let y = 13 + name.length * 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(text(c, 'openedAt')!, 6, y);
  y += 6;
  doc.text(v.caption, 6, y);
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(v.date, 6, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(v.note, 6, y);
  y += 4.5;
  doc.setFontSize(9);
  const row = (value: string, width = 88, max = 2) => {
    const wrapped = lines(doc, value, width, max);
    doc.text(wrapped, 6, y);
    y += wrapped.length * 4;
  };
  if (text(c, 'manufacturer')) row(text(c, 'manufacturer')!);
  row(text(c, 'lot')!);
  // Abaixo da altura do QR (a partir de 61 mm) o texto fica na coluna da esquerda.
  y = Math.max(y, 61);
  row(text(c, 'storage')!, 54, 1);
  row(text(c, 'handledBy')!, 54, 2);
  if (text(c, 'portion')) row(text(c, 'portion')!, 54, 1);
  if (text(c, 'quantity')) row(text(c, 'quantity')!, 54, 2);
  if (y > (data.hold ? 81 : 93))
    throw new Error('Conteúdo não cabe neste modelo de etiqueta.');
}

// Uma etiqueta por página, na ordem recebida. Qualquer recusa interrompe o arquivo inteiro.
export async function makeLabelsPdf(
  list: LabelData[],
  origin: string,
): Promise<Blob> {
  const url = validateLabels(list, origin);
  const doc = new jsPDF({ unit: 'mm', format: [100, 100], compress: false });
  for (const [index, data] of list.entries()) {
    if (index > 0) doc.addPage([100, 100]);
    doc.setTextColor(0, 0, 0);
    if (data.production) preparationPage({ doc, right: 94 }, data);
    else if (data.kind === 'derived') openedPage({ doc, right: 94 }, data);
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
      const { first, second } = labelContent(data).hold!;
      doc.text(first, 8, 88);
      doc.text(second, 8 + doc.getTextWidth(`${first}  `), 88);
      doc.setTextColor(0, 0, 0);
    }
  }
  return doc.output('blob');
}

export function makeLabelPdf(data: LabelData, origin: string): Promise<Blob> {
  return makeLabelsPdf([data], origin);
}
