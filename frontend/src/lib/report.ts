import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LOGO_BASE64 } from './logoBase64';

// Paleta de marca (coincide con styles/globals.css y lib/pdf.ts)
const INK: [number, number, number] = [8, 17, 31];
const BLUE: [number, number, number] = [0, 87, 184];
const GOLD: [number, number, number] = [245, 196, 0];
const GREY: [number, number, number] = [134, 134, 139];
const LIGHT: [number, number, number] = [245, 245, 247];
const WHITE: [number, number, number] = [255, 255, 255];
const LINE: [number, number, number] = [220, 220, 225];

export interface ReportColumn {
  header: string;
  key: string;
  align?: 'left' | 'right';
}

export interface ReportData {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  orientation?: 'portrait' | 'landscape';
  totalsLabel?: string;
  totalsValue?: string;
}

// ---- PDF ----

function buildReportPdf(report: ReportData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: report.orientation ?? 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;

  // Franja superior de marca
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, pageW, 6, 'F');

  // Logo
  try {
    doc.addImage(LOGO_BASE64, 'PNG', margin, 12, 45, 17, undefined, 'FAST');
  } catch {
    doc.setFillColor(...INK);
    doc.roundedRect(margin, 16, 18, 12, 2.5, 2.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('E&M', margin + 9, 23.5, { align: 'center' });
  }

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('E&M Electronic Solutions', margin + 50, 19);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text('Gestión de Cuentas y Cobros', margin + 50, 24);

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text(report.title.toUpperCase(), margin, 46);

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.2);
  doc.line(margin, 50, margin + 42, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GREY);
  doc.text(report.subtitle, margin, 58);
  doc.text(`Generado: ${new Date().toLocaleDateString('es-CO')}`, pageW - margin, 58, { align: 'right' });

  // Tabla
  const head = [[...report.columns.map((c) => ({ content: c.header, styles: { fillColor: INK, textColor: WHITE, fontStyle: 'bold' as const, halign: (c.align ?? 'left') as 'left' | 'right' } }))]];

  const body = report.rows.map((r, i) =>
    report.columns.map((c) => ({
      content: String(r[c.key] ?? ''),
      styles: {
        fillColor: i % 2 === 0 ? WHITE : LIGHT,
        halign: (c.align ?? 'left') as 'left' | 'right',
      },
    })),
  );

  autoTable(doc, {
    startY: 66,
    head,
    body: body.length
      ? body
      : [[{
          content: 'Sin datos para los parámetros seleccionados.',
          colSpan: report.columns.length,
          styles: { halign: 'center' as const, textColor: GREY },
        }]],
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3, textColor: INK, lineColor: LINE, lineWidth: 0.1 },
    headStyles: { lineColor: WHITE, lineWidth: 0 },
  });

  // Total
  if (report.totalsLabel && report.totalsValue) {
    const afterY = (doc as any).lastAutoTable.finalY + 8;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.line(margin, afterY - 4, pageW - margin, afterY - 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(report.totalsLabel, margin, afterY);
    doc.text(report.totalsValue, pageW - margin, afterY, { align: 'right' });
  }

  // Pie
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.3);
  doc.line(margin, pageH - 16, pageW - margin, pageH - 16);
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text(report.subtitle, margin, pageH - 11);
  doc.text('E&M Electronic Solutions', pageW - margin, pageH - 11, { align: 'right' });

  return doc;
}

export function downloadReportPdf(report: ReportData, filename: string): void {
  buildReportPdf(report).save(filename);
}

// ---- CSV (compatible con Excel) ----

export function downloadReportCsv(report: ReportData, filename: string): void {
  const escape = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    report.columns.map((c) => escape(c.header)).join(','),
    ...report.rows.map((r) => report.columns.map((c) => escape(r[c.key] ?? '')).join(',')),
  ];
  const csv = '\ufeff' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
