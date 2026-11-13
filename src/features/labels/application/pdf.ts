import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  containerPath,
  DERIVED_LABEL_MESSAGE,
  LATE_HOLD_MESSAGE,
} from '../domain/label';
import { BLOCK_TEXT } from '../../occurrences/domain/occurrence';
import type { LabelData } from '../domain/label';

export async function makeLabelPdf(
  data: LabelData,
  origin: string,
): Promise<Blob> {
  // Fatia 6.4: recipiente de manipulação anulada não ganha etiqueta, mesmo chamado direto.
  if (data.voided)
    throw new Error(
      'Manipulação anulada: este recipiente não vale mais e a etiqueta não pode ser gerada.',
    );
  if (data.late_hold) throw new Error(LATE_HOLD_MESSAGE);
  // Fatia 6.6: a etiqueta do derivado (validade e nome de quem abriu) é da 6.7; o modelo do recebimento
  // imprimiria a validade da origem.
  if (data.kind === 'derived') throw new Error(DERIVED_LABEL_MESSAGE);
  const url = new URL(origin);
  if (
    url.origin !== 'http://127.0.0.1:5173' &&
    url.origin !== 'http://127.0.0.1:5174'
  )
    throw new Error('Endereço de demonstração indisponível.');
  const batch = data.batch_receipts;
  const text = [batch.products.name, batch.source_code];
  if (text.some((item) => /[^\u0020-\u007e\u00a0-\u00ff]/u.test(item)))
    throw new Error(
      'Nome ou lote contém caracteres não disponíveis neste modelo de PDF.',
    );
  const doc = new jsPDF({ unit: 'mm', format: [100, 100], compress: false });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const lines = doc.splitTextToSize(batch.products.name, 88) as string[];
  if (lines.length > 4)
    throw new Error('Nome muito longo para esta etiqueta de demonstração.');
  doc.text(lines, 6, 10);
  const y = 10 + lines.length * 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const code = doc.splitTextToSize(
    `Lote: ${batch.source_code}`,
    88,
  ) as string[];
  if (code.length > 3)
    throw new Error(
      'Código do lote muito longo para esta etiqueta de demonstração.',
    );
  doc.text(code, 6, y);
  const next = y + code.length * 4 + 2;
  doc.text(`Quantidade inicial: ${batch.quantity} ${batch.unit}`, 6, next);
  doc.text(
    `Validade: ${batch.expiry_date} (${batch.expiry_origin === 'original' ? 'original' : 'responsável'})`,
    6,
    next + 5,
  );
  doc.text(`ID: ${data.id}`, 6, 95);
  if (next + 5 > 59)
    throw new Error('Conteúdo não cabe neste modelo de etiqueta.');
  const qr = await QRCode.toDataURL(`${url.origin}${containerPath(data.id)}`, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
  });
  doc.addImage(qr, 'PNG', 62, 61, 30, 30);
  // Fatia 6.5b (desenho 7.2): faixa de bloqueio enquanto houver ocorrência sem decisão ou rejeitada.
  if (data.hold) {
    doc.setFillColor(0, 0, 0);
    doc.rect(6, 64, 52, 16, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const [first, second] = BLOCK_TEXT[data.hold].split(' - ');
    doc.text([first ?? '', second ?? ''], 9, 70);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
  }
  return doc.output('blob');
}
