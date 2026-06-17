import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Paleta Lumina
const C = {
  green:      [22, 163, 74],    // #16a34a
  greenLight: [240, 253, 244],
  greenDark:  [5, 46, 22],
  gray:       [100, 116, 139],
  grayLight:  [248, 250, 252],
  text:       [15, 23, 42],
  white:      [255, 255, 255],
  border:     [226, 232, 240],
  yellow:     [234, 179, 8],
};

const cop = n => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const fmtDate = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

// Dibuja el encabezado verde con logo ⚡ Lumina
function drawHeader(doc, pageW) {
  // Fondo verde oscuro
  doc.setFillColor(...C.greenDark);
  doc.rect(0, 0, pageW, 42, 'F');

  // Rayo ⚡ (texto grande)
  doc.setFontSize(26);
  doc.setTextColor(...C.green);
  doc.text('⚡', 14, 22);

  // Nombre empresa
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text('LUMINA', 28, 20);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.green);
  doc.text('ELECTROLINERAS', 28, 27);
  doc.text('Carga eléctrica inteligente', 28, 33);

  // Línea decorativa verde
  doc.setFillColor(...C.green);
  doc.rect(0, 42, pageW, 2, 'F');
}

// Pie de página
function drawFooter(doc, pageNum, totalPages, pageW, pageH) {
  doc.setFillColor(...C.greenDark);
  doc.rect(0, pageH - 16, pageW, 16, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.green);
  doc.text('Lumina Electrolineras SAS  ·  contacto@lumina.com.co  ·  www.lumina.com.co', 14, pageH - 6);
  doc.setTextColor(...C.white);
  doc.text(`Página ${pageNum} de ${totalPages}`, pageW - 14, pageH - 6, { align: 'right' });
}

// Recuadro info (etiqueta + valor)
function infoBox(doc, x, y, w, h, label, value, labelColor, valueColor, bgColor) {
  doc.setFillColor(...(bgColor || C.grayLight));
  doc.roundedRect(x, y, w, h, 3, 3, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...(labelColor || C.gray));
  doc.text(label, x + 5, y + 8);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...(valueColor || C.text));
  doc.text(value, x + 5, y + 18);
}

/**
 * Genera el PDF de solicitud de factura para UN aliado.
 * @param {object} aliado   { razon_social, nit, email, contacto }
 * @param {Array}  rows     filas del reporte (una por estación)
 * @param {string} desde
 * @param {string} hasta
 */
export function generarPDFAliado(aliado, rows, desde, hasta) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;

  // ── ENCABEZADO ──────────────────────────────────────────
  drawHeader(doc, pageW);

  // ── TÍTULO DEL DOCUMENTO ────────────────────────────────
  doc.setFillColor(...C.greenLight);
  doc.rect(margin, 50, contentW, 14, 'F');
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.greenDark);
  doc.text('SOLICITUD DE FACTURACIÓN', margin + 4, 59);

  // Número y fecha
  const now = new Date();
  const docNum = `LUM-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-${aliado.nit?.replace(/\D/g,'').slice(-4)||'0000'}`;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text(`Ref: ${docNum}  ·  Emitido: ${now.toLocaleDateString('es-CO')}`, pageW - margin, 59, { align: 'right' });

  // ── DATOS: Para / De ────────────────────────────────────
  let y = 72;

  // "Para" (aliado factura A Lumina)
  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, contentW * 0.48, 38, 3, 3, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.green);
  doc.text('FACTURAR A:', margin + 5, y + 7);
  doc.setFontSize(10);
  doc.setTextColor(...C.text);
  doc.text('Lumina Electrolineras SAS', margin + 5, y + 15);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text('NIT: 901.XXX.XXX-X', margin + 5, y + 22);
  doc.text('contacto@lumina.com.co', margin + 5, y + 28);
  doc.text('www.lumina.com.co', margin + 5, y + 34);

  // "De" (el aliado)
  const col2x = margin + contentW * 0.52;
  const col2w = contentW * 0.48;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(...C.green);
  doc.roundedRect(col2x, y, col2w, 38, 3, 3, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.green);
  doc.text('EMITIDO POR:', col2x + 5, y + 7);
  doc.setFontSize(10);
  doc.setTextColor(...C.text);
  doc.text(aliado.razon_social, col2x + 5, y + 15);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text(`NIT: ${aliado.nit || '—'}`, col2x + 5, y + 22);
  if (aliado.email)    doc.text(aliado.email,    col2x + 5, y + 28);
  if (aliado.contacto) doc.text(aliado.contacto, col2x + 5, y + 34);

  // ── PERÍODO ─────────────────────────────────────────────
  y += 44;
  doc.setFillColor(...C.greenDark);
  doc.roundedRect(margin, y, contentW, 10, 2, 2, 'F');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text(`PERÍODO: ${fmtDate(desde)}  al  ${fmtDate(hasta)}`, margin + 4, y + 7);

  // ── CAPÍTULO 1: ENERGÍA ─────────────────────────────────
  y += 16;
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.greenDark);
  doc.text('CAPÍTULO 1  —  ENERGÍA SUMINISTRADA', margin, y);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text('Consumo de energía eléctrica registrado por los cargadores Lumina instalados en sus instalaciones.', margin, y + 5);

  y += 10;

  const energiaRows = rows.map(r => [
    r.station_name,
    r.city || '—',
    r.sesiones,
    parseFloat(r.kwh_total).toFixed(3) + ' kWh',
    cop(r.cost_per_kwh) + '/kWh',
    cop(r.costo_energia),
  ]);

  const totalKwh    = rows.reduce((s, r) => s + (r.kwh_total || 0), 0);
  const totalCosto  = rows.reduce((s, r) => s + (r.costo_energia || 0), 0);

  autoTable(doc, {
    startY: y,
    head: [['Estación', 'Ciudad', 'Sesiones', 'kWh consumidos', 'Tarifa pactada', 'Valor energía']],
    body: energiaRows,
    foot: [['', '', '', parseFloat(totalKwh.toFixed(3)) + ' kWh', 'SUBTOTAL', cop(totalCosto)]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4, textColor: C.text },
    headStyles: { fillColor: C.greenDark, textColor: C.white, fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: C.green, textColor: C.white, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 253, 250] },
    columnStyles: {
      0: { cellWidth: 50 },
      2: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
  });

  y = doc.lastAutoTable.finalY + 6;

  // ── CAPÍTULO 2: COMISIÓN ─────────────────────────────────
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.greenDark);
  doc.text('CAPÍTULO 2  —  COMISIÓN POR VENTAS', margin, y);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.gray);
  doc.text('Comisión sobre las ventas de carga eléctrica realizadas en sus instalaciones, según porcentaje negociado.', margin, y + 5);

  y += 10;

  const comisionRows = rows.map(r => [
    r.station_name,
    r.city || '—',
    `${r.commission_pct}%`,
    cop(r.comision),
  ]);

  const totalComision = rows.reduce((s, r) => s + (r.comision || 0), 0);

  autoTable(doc, {
    startY: y,
    head: [['Estación', 'Ciudad', '% Comisión pactada', 'Valor comisión']],
    body: comisionRows,
    foot: [['', '', 'SUBTOTAL COMISIÓN', cop(totalComision)]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 4, textColor: C.text },
    headStyles: { fillColor: [5, 80, 40], textColor: C.white, fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: C.green, textColor: C.white, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 253, 250] },
    columnStyles: {
      2: { halign: 'center' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── TOTAL GENERAL ────────────────────────────────────────
  const totalGeneral = totalCosto + totalComision;

  // Comprueba si cabe en la página, si no, nueva página
  if (y + 50 > pageH - 30) {
    doc.addPage();
    drawHeader(doc, pageW);
    y = 52;
  }

  // Fondo total
  doc.setFillColor(...C.greenDark);
  doc.roundedRect(margin, y, contentW, 28, 4, 4, 'F');

  // Desglose mini
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...C.green);
  doc.text(`Capítulo 1 — Energía:   ${cop(totalCosto)}`, margin + 8, y + 9);
  doc.text(`Capítulo 2 — Comisión:  ${cop(totalComision)}`, margin + 8, y + 17);

  // Línea separadora
  doc.setDrawColor(...C.green);
  doc.setLineWidth(0.3);
  doc.line(margin + 8, y + 19, pageW - margin - 8, y + 19);

  // Monto total grande
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.white);
  doc.text('TOTAL A FACTURAR:', margin + 8, y + 27);
  doc.setFontSize(17);
  doc.setTextColor(...C.green);
  doc.text(cop(totalGeneral), pageW - margin - 5, y + 27, { align: 'right' });

  y += 36;

  // Nota legal
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...C.gray);
  const nota = 'Favor emitir la factura electrónica a nombre de Lumina Electrolineras SAS con los conceptos y montos indicados en los capítulos anteriores. El pago se realizará dentro de los 15 días hábiles siguientes a la recepción de la factura.';
  const lines = doc.splitTextToSize(nota, contentW);
  doc.text(lines, margin, y);

  // ── FOOTER en cada página ───────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPages, pageW, pageH);
  }

  const fname = `Lumina_Facturacion_${aliado.razon_social.replace(/\s+/g, '_').slice(0, 20)}_${desde}_${hasta}.pdf`;
  doc.save(fname);
}
