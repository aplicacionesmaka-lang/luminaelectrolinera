import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Paleta Lumina
const G = {
  dark:   [5,  46, 22],
  mid:    [22, 163, 74],
  light:  [240, 253, 244],
  white:  [255, 255, 255],
  gray:   [100, 116, 139],
  grayL:  [248, 250, 252],
  text:   [15,  23, 42],
  border: [226, 232, 240],
  amber:  [180, 83, 9],
};

const cop  = n => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const fmtD = s => s
  ? new Date(s + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
  : '';

// Dibuja el rayo Lumina con trazos (sin emoji)
function drawRayo(doc, cx, cy, size) {
  // Polígono rayo: triángulo superior + triángulo inferior desplazado
  const s = size;
  // Puntos del rayo (coordenadas relativas a cx,cy)
  const pts = [
    [cx,       cy - s],          // punta arriba
    [cx - s * 0.35, cy + s * 0.1], // esquina izq
    [cx + s * 0.05, cy + s * 0.1], // centro
    [cx,       cy + s],          // punta abajo
    [cx + s * 0.35, cy - s * 0.1], // esquina der
    [cx - s * 0.05, cy - s * 0.1], // centro
  ];
  doc.setFillColor(...G.mid);
  // jsPDF no tiene polygon nativo, usamos lines
  doc.lines(
    pts.slice(1).map((p, i) => {
      const prev = i === 0 ? pts[0] : pts[i];
      return [p[0] - prev[0], p[1] - prev[1]];
    }),
    pts[0][0], pts[0][1], [1, 1], 'F', true
  );
}

function drawHeader(doc, pageW) {
  // Fondo verde oscuro
  doc.setFillColor(...G.dark);
  doc.rect(0, 0, pageW, 44, 'F');

  // Franja verde brillante izquierda
  doc.setFillColor(...G.mid);
  doc.rect(0, 0, 5, 44, 'F');

  // Rayo gráfico (sin emoji)
  drawRayo(doc, 20, 22, 9);

  // Nombre empresa
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...G.white);
  doc.text('LUMINA', 34, 18);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...G.mid);
  doc.text('ELECTROLINERAS QCUTE SAS', 34, 25);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(134, 239, 172); // verde claro
  doc.text('NIT: 901.993.025-0', 34, 32);
  doc.text('contacto@lumina.com.co  |  www.luminaELECTROLINERAS.com', 34, 38);

  // Línea inferior verde brillante
  doc.setFillColor(...G.mid);
  doc.rect(0, 44, pageW, 1.5, 'F');
}

function drawFooter(doc, num, total, pageW, pageH) {
  doc.setFillColor(...G.dark);
  doc.rect(0, pageH - 14, pageW, 14, 'F');
  doc.setFillColor(...G.mid);
  doc.rect(0, pageH - 14, 5, 14, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...G.mid);
  doc.text('Lumina Electrolineras QCUTE SAS  ·  NIT 901.993.025-0  ·  contacto@lumina.com.co', 10, pageH - 5);
  doc.setTextColor(...G.white);
  doc.text(`Página ${num} de ${total}`, pageW - 12, pageH - 5, { align: 'right' });
}

/**
 * Genera el PDF de solicitud de factura para UN aliado.
 * Solo se factura la energía. La comisión se muestra informativa.
 */
export function generarPDFAliado(aliado, rows, desde, hasta) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const ML    = 14;
  const cW    = pageW - ML * 2;

  drawHeader(doc, pageW);

  // ── Título documento ───────────────────────────────────────────────────────
  doc.setFillColor(...G.light);
  doc.roundedRect(ML, 50, cW, 13, 2, 2, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...G.dark);
  doc.text('SOLICITUD DE FACTURACIÓN — SERVICIO DE ENERGÍA ELÉCTRICA', ML + 4, 58);

  // Ref y fecha
  const now    = new Date();
  const docNum = `LUM-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-${(aliado.nit||'').replace(/\D/g,'').slice(-4)||'0000'}`;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...G.gray);
  doc.text(`Ref: ${docNum}   Emisión: ${now.toLocaleDateString('es-CO')}`, pageW - ML, 58, { align: 'right' });

  // ── Bloques Para / De ──────────────────────────────────────────────────────
  let y = 68;
  const bH  = 36;
  const bW  = cW * 0.48;

  // "Facturar a" — Lumina
  doc.setFillColor(...G.grayL);
  doc.setDrawColor(...G.border);
  doc.setLineWidth(0.4);
  doc.roundedRect(ML, y, bW, bH, 3, 3, 'FD');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...G.mid);
  doc.text('FACTURAR A:', ML + 5, y + 7);
  doc.setFontSize(9.5);
  doc.setTextColor(...G.text);
  doc.text('Lumina Electrolineras QCUTE SAS', ML + 5, y + 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...G.gray);
  doc.text('NIT: 901.993.025-0', ML + 5, y + 20);
  doc.text('contacto@lumina.com.co', ML + 5, y + 26);
  doc.text('www.luminaELECTROLINERAS.com', ML + 5, y + 32);

  // "Emitido por" — Aliado
  const x2 = ML + cW * 0.52;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(...G.mid);
  doc.roundedRect(x2, y, bW, bH, 3, 3, 'FD');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...G.mid);
  doc.text('EMITIDO POR:', x2 + 5, y + 7);
  doc.setFontSize(9.5);
  doc.setTextColor(...G.text);
  doc.text(aliado.razon_social, x2 + 5, y + 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...G.gray);
  doc.text(`NIT: ${aliado.nit || '—'}`, x2 + 5, y + 20);
  if (aliado.email)    doc.text(aliado.email,    x2 + 5, y + 26);
  if (aliado.contacto) doc.text(aliado.contacto, x2 + 5, y + 32);

  // ── Período ────────────────────────────────────────────────────────────────
  y += bH + 6;
  doc.setFillColor(...G.dark);
  doc.roundedRect(ML, y, cW, 9, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...G.white);
  doc.text(`PERÍODO DE FACTURACIÓN:  ${fmtD(desde)}  al  ${fmtD(hasta)}`, ML + 4, y + 6.5);

  // ── CAPÍTULO 1: ENERGÍA — CONCEPTO A FACTURAR ─────────────────────────────
  y += 15;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...G.dark);
  doc.text('CONCEPTO A FACTURAR  —  ENERGÍA ELÉCTRICA SUMINISTRADA', ML, y);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...G.gray);
  doc.text('Consumo de energía eléctrica registrado por los cargadores Lumina instalados en sus instalaciones.', ML, y + 5);

  y += 9;

  const totalKwh   = rows.reduce((s, r) => s + (r.kwh_total     || 0), 0);
  const totalCosto = rows.reduce((s, r) => s + (r.costo_energia || 0), 0);

  autoTable(doc, {
    startY: y,
    head: [['Punto de carga / Estación', 'Ciudad', 'Sesiones', 'kWh consumidos', 'Tarifa pactada (COP/kWh)', 'Valor a facturar (COP)']],
    body: rows.map(r => [
      r.station_name,
      r.city || '—',
      r.sesiones,
      parseFloat(r.kwh_total).toFixed(3) + ' kWh',
      cop(r.cost_per_kwh),
      cop(r.costo_energia),
    ]),
    foot: [['', '', '', parseFloat(totalKwh.toFixed(3)) + ' kWh', 'TOTAL A FACTURAR (COP)', cop(totalCosto)]],
    margin: { left: ML, right: ML },
    styles: { fontSize: 8.5, cellPadding: 3.5, textColor: G.text },
    headStyles: { fillColor: G.dark, textColor: G.white, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: G.mid,  textColor: G.white, fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 253, 250] },
    columnStyles: {
      0: { cellWidth: 52 },
      2: { halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
  });

  y = doc.lastAutoTable.finalY + 6;

  // ── TOTAL A FACTURAR (caja principal) ─────────────────────────────────────
  if (y + 22 > pageH - 30) { doc.addPage(); drawHeader(doc, pageW); y = 52; }

  doc.setFillColor(...G.dark);
  doc.roundedRect(ML, y, cW, 20, 4, 4, 'F');
  doc.setFillColor(...G.mid);
  doc.roundedRect(ML, y, cW * 0.55, 20, 4, 4, 'F');  // franja izquierda decorativa
  doc.setFillColor(...G.dark);
  doc.roundedRect(ML + cW * 0.52, y, cW * 0.48, 20, 4, 4, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...G.white);
  doc.text('TOTAL A FACTURAR', ML + 6, y + 13);

  doc.setFontSize(16);
  doc.setTextColor(134, 239, 172);
  doc.text(cop(totalCosto), pageW - ML - 5, y + 14, { align: 'right' });

  y += 26;

  // ── CAPÍTULO 2: COMISIÓN (SOLO INFORMATIVO) ───────────────────────────────
  if (y + 10 > pageH - 40) { doc.addPage(); drawHeader(doc, pageW); y = 52; }

  // Encabezado sección informativa
  doc.setFillColor(254, 252, 232); // amarillo muy suave
  doc.setDrawColor(234, 179, 8);
  doc.setLineWidth(0.5);
  doc.roundedRect(ML, y, cW, 9, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(120, 80, 0);
  doc.text('INFORMACIÓN ADICIONAL  —  COMISIÓN POR VENTAS  (solo referencial, no forma parte de la factura)', ML + 4, y + 6.5);

  y += 14;

  const totalComision = rows.reduce((s, r) => s + (r.comision || 0), 0);

  autoTable(doc, {
    startY: y,
    head: [['Punto de carga / Estación', 'Ciudad', '% Comisión pactada', 'Valor referencial (COP)']],
    body: rows.map(r => [
      r.station_name,
      r.city || '—',
      `${r.commission_pct}%`,
      cop(r.comision),
    ]),
    foot: [['', '', 'TOTAL COMISIÓN (referencial)', cop(totalComision)]],
    margin: { left: ML, right: ML },
    styles: { fontSize: 8.5, cellPadding: 3.5, textColor: G.text },
    headStyles: { fillColor: [120, 80, 0], textColor: G.white, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [180, 120, 0], textColor: G.white, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [255, 253, 244] },
    columnStyles: {
      2: { halign: 'center' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── Nota legal ─────────────────────────────────────────────────────────────
  if (y + 18 > pageH - 25) { doc.addPage(); drawHeader(doc, pageW); y = 52; }

  doc.setFillColor(...G.grayL);
  doc.roundedRect(ML, y, cW, 16, 2, 2, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...G.dark);
  doc.text('Instrucciones de pago:', ML + 5, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...G.gray);
  const nota = 'Favor emitir la factura electrónica a nombre de Lumina Electrolineras QCUTE SAS, NIT 901.993.025-0, por el concepto de energía eléctrica suministrada indicado arriba. El pago se realizará dentro de los 15 días hábiles siguientes a la recepción de la factura.';
  const lines = doc.splitTextToSize(nota, cW - 10);
  doc.text(lines, ML + 5, y + 12);

  // ── Pies en todas las páginas ──────────────────────────────────────────────
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, p, total, pageW, pageH);
  }

  const safe  = aliado.razon_social.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  doc.save(`Lumina_Factura_${safe}_${desde}_${hasta}.pdf`);
}
