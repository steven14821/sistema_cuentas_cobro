import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { nombreMes } from './period';
import { LOGO_BASE64 } from './logoBase64';

// Paleta de marca (coincide con styles/globals.css)
const INK: [number, number, number] = [8, 17, 31];      // #08111F
const BLUE: [number, number, number] = [0, 87, 184];     // #0057B8
const GOLD: [number, number, number] = [245, 196, 0];    // #F5C400
const GREY: [number, number, number] = [134, 134, 139];  // #86868B
const LIGHT: [number, number, number] = [245, 245, 247]; // #F5F5F7
const WHITE: [number, number, number] = [255, 255, 255];
const LINE: [number, number, number] = [220, 220, 225];

export interface ServicioPdf {
  orden: string;
  tipo: string;
  descripcion: string;
  valor: number;
}

export interface CuentaPdf {
  mes: number;      // 1-12
  anio: number;
  tecnico: string;
  servicios: ServicioPdf[];
  estado: string;
  // Cuentas de solo resumen (historial): total y conteo precalculados,
  // ya que no se tiene el detalle itemizado de servicios cerrados.
  total?: number;
  serviciosCount?: number;
}

// Formato COP alineado con la UI: 50000 -> "$ 50.000".
// Se mantiene local (espacio normal) en vez de formatCOP: jsPDF no renderiza
// el espacio duro (U+00A0) que produce Intl currency para es-CO.
const cop = (v: number) =>
  '$ ' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);

const pad2 = (n: number) => String(n).padStart(2, '0');

// Construye el documento de la cuenta de cobro y lo devuelve (sin descargar).
export function buildCuentaPdf(cuenta: CuentaPdf): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const usable = pageW - margin * 2;

  const total = cuenta.total ?? cuenta.servicios.reduce((acc, s) => acc + s.valor, 0);
  const countServicios = cuenta.serviciosCount ?? cuenta.servicios.length;
  const mesNombre = nombreMes(cuenta.mes);

  // ---- Cabecera de marca ----
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, pageW, 6, 'F'); // franja superior

  try {
    // Dibujamos el logo de la empresa
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
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('E&M Electronic Solutions', margin + 50, 19);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text('Gestión de Cuentas y Cobros', margin + 50, 24);

  // ---- Título del documento ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text('CUENTA DE COBRO', margin, 46);

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.2);
  doc.line(margin, 50, margin + 42, 50);

  // ---- Metadatos ----
  const metaY = 60;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const meta: [string, string][] = [
    ['Período', `${mesNombre} ${cuenta.anio}`],
    ['Técnico', cuenta.tecnico],
    ['Estado', cuenta.estado],
    ['Servicios', String(countServicios)],
    ['Emitido', new Date().toLocaleDateString('es-CO')],
  ];

  let y = metaY;
  for (const [k, v] of meta) {
    doc.setTextColor(...GREY);
    doc.text(k, margin, y);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.text(v, margin + 32, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  }

  // ---- Tabla de servicios ----
  const head = [[
    { content: 'Orden', styles: { fillColor: INK, textColor: WHITE, fontStyle: 'bold' as const } },
    { content: 'Tipo de Servicio', styles: { fillColor: INK, textColor: WHITE, fontStyle: 'bold' as const } },
    { content: 'Descripción', styles: { fillColor: INK, textColor: WHITE, fontStyle: 'bold' as const } },
    { content: 'Valor', styles: { fillColor: INK, textColor: WHITE, fontStyle: 'bold' as const, halign: 'right' as const } },
  ]];

  const body = cuenta.servicios.map((s, i) => [
    { content: s.orden, styles: { fillColor: i % 2 === 0 ? WHITE : LIGHT } },
    { content: s.tipo, styles: { fillColor: i % 2 === 0 ? WHITE : LIGHT } },
    { content: s.descripcion, styles: { fillColor: i % 2 === 0 ? WHITE : LIGHT } },
    { content: cop(s.valor), styles: { fillColor: i % 2 === 0 ? WHITE : LIGHT, halign: 'right' as const } },
  ]);

  autoTable(doc, {
    startY: y + 4,
    head,
    body: body.length
      ? body
      : [[{
          content: `Cuenta cerrada · ${countServicios} servicio${countServicios !== 1 ? 's' : ''} · detalle no disponible`,
          colSpan: 4,
          styles: { halign: 'center' as const, textColor: GREY }
        }]],
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 3, textColor: INK, lineColor: LINE, lineWidth: 0.1 },
    headStyles: { lineColor: WHITE, lineWidth: 0 },
  });

  // Línea de total justo debajo de la tabla
  const afterY = (doc as any).lastAutoTable.finalY + 8;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.line(margin, afterY - 4, pageW - margin, afterY - 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text('Total a Cobrar', margin, afterY);
  doc.text(cop(total), pageW - margin, afterY, { align: 'right' });

  // ---- Firma ----
  const sigY = afterY + 40;
  doc.setDrawColor(...GREY);
  doc.setLineWidth(0.3);
  doc.line(margin + 10, sigY, margin + 70, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text('Firma del Técnico', margin + 40, sigY + 5, { align: 'center' });

  // ---- Pie de página ----
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...LIGHT);
  doc.setLineWidth(0.3);
  doc.line(margin, pageH - 16, pageW - margin, pageH - 16);
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text(`Período ${mesNombre} ${cuenta.anio} · ${cuenta.tecnico}`, margin, pageH - 11);
  doc.text('E&M Electronic Solutions', pageW - margin, pageH - 11, { align: 'right' });

  return doc;
}

// Construye y dispara la descarga del PDF.
export function downloadCuentaPdf(cuenta: CuentaPdf): void {
  const doc = buildCuentaPdf(cuenta);
  const mesNum = pad2(cuenta.mes);
  const file = `cuenta-cobro-${cuenta.anio}-${mesNum}-${cuenta.tecnico
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.pdf`;
  doc.save(file);
}
