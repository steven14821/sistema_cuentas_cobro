import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { nombreMes } from './period';
import { numeroALetras } from './numeroALetras';
import { POR_DEFINIR } from './valorAdmin';

export interface ServicioPdf {
  orden: string;
  tipo: string;
  descripcion: string;
  valor: number;
  porDefinir?: boolean;
}

export interface DatosCobroPdf {
  banco?: string;
  numero_cuenta?: string;
  nit?: string;
  telefono?: string;
  lugar_expedicion?: string;
}

export interface CuentaPdf {
  mes: number;      // 1-12
  anio: number;
  tecnico: string;
  servicios: ServicioPdf[];
  estado: string;
  total?: number;
  totalPorDefinir?: boolean;
  serviciosCount?: number;
  firmaTecnico?: string | null;
  fechaFirma?: string | null;
  datosCobro?: DatosCobroPdf | null;
}

// Formateador de moneda estilo plantilla: 141000 -> "141.000"
const formatMonto = (v: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);

export function buildCuentaPdf(cuenta: CuentaPdf): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const centerX = pageW / 2;

  const total = cuenta.total ?? cuenta.servicios.reduce((acc, s) => acc + s.valor, 0);
  const mesNombre = nombreMes(cuenta.mes).toLowerCase();
  const mesNombreCap = nombreMes(cuenta.mes);

  const datos = cuenta.datosCobro || {};
  const nitTecnico = datos.nit || '—';
  const ciudadTecnico = datos.lugar_expedicion || 'Girón – Santander';
  const cuentaBancaria = datos.numero_cuenta || '—';
  const bancoNombre = datos.banco || 'Bancolombia';
  const telefonoTecnico = datos.telefono || '—';

  // Rango de fechas del período: último día del mes
  const ultimoDia = new Date(cuenta.anio, cuenta.mes, 0).getDate();
  const fechaConcepto = `(01 de ${mesNombre} hasta ${ultimoDia} de ${mesNombre} de ${cuenta.anio})`;

  // =========================================================================
  // PÁGINA 1: CUENTA DE COBRO FORMAL
  // =========================================================================

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 90, 165); // Color azul elegante corporativo
  doc.text('E&M ELECTRONIC SOLUTIONS SAS', centerX, 36, { align: 'center' });

  doc.setFontSize(10.5);
  doc.setTextColor(0, 0, 0);
  doc.text('NIT: 901.523.861-8', centerX, 43, { align: 'center' });

  // DEBE A:
  let y = 72;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DEBE A:', centerX, y, { align: 'center' });

  y += 9;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(cuenta.tecnico, centerX, y, { align: 'center' });

  y += 6.5;
  doc.text(`NIT: ${nitTecnico}`, centerX, y, { align: 'center' });

  y += 6.5;
  doc.text(ciudadTecnico, centerX, y, { align: 'center' });

  // LA SUMA DE:
  y += 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('LA SUMA DE:', centerX, y, { align: 'center' });

  y += 9;
  doc.setFontSize(12);
  doc.text(cuenta.totalPorDefinir ? POR_DEFINIR : formatMonto(total), centerX, y, { align: 'center' });

  y += 6.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(
    cuenta.totalPorDefinir
      ? '(el administrador asigna el valor antes de aprobar)'
      : numeroALetras(total),
    centerX,
    y,
    { align: 'center' }
  );

  y += 11;
  doc.text(`por favor consignar a la cuenta de ahorros ${bancoNombre}:`, centerX, y, { align: 'center' });

  y += 8.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(cuentaBancaria, centerX, y, { align: 'center' });

  // POR CONCEPTO DE:
  y = 195;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('POR CONCEPTO DE:', 26, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `servicios prestados como técnico en E&M ELECTRONIC SOLUTIONS SAS de ${fechaConcepto}`,
    26,
    y,
    { maxWidth: pageW - 52 }
  );

  // COORDIALMENTE,
  y = 222;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('COORDIALMENTE,', 26, y);

  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(cuenta.tecnico, 26, y);

  y += 5.5;
  doc.text(`NIT: ${nitTecnico}`, 26, y);

  y += 5.5;
  doc.text(`Teléfono: ${telefonoTecnico}`, 26, y);

  // =========================================================================
  // PÁGINA 2: DETALLE DE LAS ÓRDENES PRESTADAS
  // =========================================================================
  doc.addPage();

  const marginX = 26;
  let page2Y = 32;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(`DETALLE DE LAS ÓRDENES PRESTADAS MES (${mesNombre})`, marginX, page2Y);

  // Tabla con 4 columnas: Referencia | Tipo de Servicio | Descripción | Pago
  const head = [[
    { content: 'referencia', styles: { halign: 'left' as const, fontStyle: 'bold' as const } },
    { content: 'tipo de servicio', styles: { halign: 'left' as const, fontStyle: 'bold' as const } },
    { content: 'descripción', styles: { halign: 'left' as const, fontStyle: 'bold' as const } },
    { content: 'pago', styles: { halign: 'right' as const, fontStyle: 'bold' as const } },
  ]];

  const body = cuenta.servicios.map((s) => [
    { content: s.orden },
    { content: s.tipo || '—' },
    { content: s.descripcion || '—' },
    { content: s.porDefinir ? POR_DEFINIR : formatMonto(s.valor), styles: { halign: 'right' as const } },
  ]);

  // Fila de Total
  body.push([
    { content: '' },
    { content: '' },
    { content: 'total', styles: { halign: 'right' as const } },
    { content: cuenta.totalPorDefinir ? POR_DEFINIR : formatMonto(total), styles: { halign: 'right' as const } },
  ]);

  autoTable(doc, {
    startY: page2Y + 8,
    head,
    body,
    theme: 'grid',
    margin: { left: marginX, right: marginX },
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      cellPadding: 2.8,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    columnStyles: {
      0: { cellWidth: 26 }, // referencia
      1: { cellWidth: 42 }, // tipo de servicio
      2: { cellWidth: 'auto' }, // descripción
      3: { cellWidth: 26, halign: 'right' }, // pago
    },
  });

  // Sección de firma
  const finalTableY = (doc as any).lastAutoTable?.finalY ?? 180;
  let sigY = finalTableY + 36;
  if (sigY + 30 > pageH - 20) {
    doc.addPage();
    sigY = 40;
  }

  // Si tiene firma gráfica guardada
  if (cuenta.firmaTecnico) {
    try {
      doc.addImage(cuenta.firmaTecnico, 'PNG', marginX, sigY - 24, 52, 22);
    } catch {
      // Ignorar si hay problema con la imagen base64
    }
  }

  // Línea de firma
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.line(marginX, sigY, marginX + 68, sigY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Firma aceptación de pago', marginX, sigY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Nit: ${nitTecnico}`, marginX, sigY + 10.5);

  const fechaFirmaTexto = cuenta.fechaFirma
    ? new Date(cuenta.fechaFirma).toLocaleDateString('es-CO')
    : `${ultimoDia}/${mesNombreCap}/${cuenta.anio}`;
  doc.text(`Fecha: ${fechaFirmaTexto}`, marginX, sigY + 15.5);

  return doc;
}

export function downloadCuentaPdf(cuenta: CuentaPdf): void {
  const doc = buildCuentaPdf(cuenta);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const mesNum = pad2(cuenta.mes);
  const file = `cuenta-cobro-${cuenta.anio}-${mesNum}-${cuenta.tecnico
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.pdf`;
  doc.save(file);
}
