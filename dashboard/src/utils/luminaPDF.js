import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const G = {
  dark:  [5,  46, 22],
  mid:   [22, 163, 74],
  light: [240, 253, 244],
  white: [255, 255, 255],
  gray:  [100, 116, 139],
  grayL: [248, 250, 252],
  text:  [15,  23, 42],
  bord:  [226, 232, 240],
};

const cop  = n => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const fmtD = s => s
  ? new Date(s + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
  : '';
const fmtDT = s => s
  ? new Date(s).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

function drawRayo(doc, x, y, w, h) {
  // Polígono rayo con doc.lines() (compatible jsPDF 4.x)
  // 6 puntos formando el clásico rayo ⚡
  const pts = [
    [x + w * 0.58, y],             // punta superior
    [x,            y + h * 0.46],  // esquina izq media
    [x + w * 0.40, y + h * 0.46],  // centro izq media
    [x + w * 0.42, y + h],         // punta inferior
    [x + w,        y + h * 0.54],  // esquina der media
    [x + w * 0.60, y + h * 0.54],  // centro der media
  ];
  const rels = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
  doc.setFillColor(...G.mid);
  doc.lines(rels, pts[0][0], pts[0][1], [1, 1], 'F', true);
}

function drawHeader(doc, pageW) {
  doc.setFillColor(...G.dark);
  doc.rect(0, 0, pageW, 44, 'F');
  doc.setFillColor(...G.mid);
  doc.rect(0, 0, 5, 44, 'F');

  // Rayo usando polígono vectorial
  drawRayo(doc, 12, 7, 14, 30);

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...G.white);
  doc.text('LUMINA', 34, 18);
  doc.setFontSize(7.5);
  doc.setTextColor(...G.mid);
  doc.text('ELECTROLINERAS QCUTE SAS', 34, 25);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(134, 239, 172);
  doc.text('NIT: 901.993.025-0', 34, 31);
  doc.text('contacto@lumina.com.co  |  www.luminaELECTROLINERAS.com', 34, 37);

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
  doc.text(`Pág. ${num} / ${total}`, pageW - 12, pageH - 5, { align: 'right' });
}

/**
 * @param {object} aliado   { id, razon_social, nit, email, contacto }
 * @param {Array}  rows     filas agrupadas por estación (de /liquidacion)
 * @param {Array}  sesiones filas detalladas (de /liquidacion/detalle)
 * @param {string} desde
 * @param {string} hasta
 */
export function generarPDFAliado(aliado, rows, sesiones, desde, hasta) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const ML    = 14;
  const cW    = pageW - ML * 2;

  drawHeader(doc, pageW);

  // ── Título ─────────────────────────────────────────────────────────────────
  doc.setFillColor(...G.light);
  doc.roundedRect(ML, 50, cW, 12, 2, 2, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...G.dark);
  doc.text('SOLICITUD DE FACTURACIÓN — SERVICIO DE ENERGÍA ELÉCTRICA', ML + 4, 57.5);

  const now    = new Date();
  const docNum = `LUM-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-${(aliado.nit||'').replace(/\D/g,'').slice(-4)||'0000'}`;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...G.gray);
  doc.text(`Ref: ${docNum}   Emisión: ${now.toLocaleDateString('es-CO')}`, pageW - ML, 57.5, { align: 'right' });

  // ── Para / De ──────────────────────────────────────────────────────────────
  let y = 67;
  const bH = 36, bW = cW * 0.48;

  doc.setFillColor(...G.grayL);
  doc.setDrawColor(...G.bord);
  doc.setLineWidth(0.4);
  doc.roundedRect(ML, y, bW, bH, 3, 3, 'FD');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...G.mid);
  doc.text('FACTURAR A:', ML + 5, y + 7);
  doc.setFontSize(9); doc.setTextColor(...G.text);
  doc.text('Lumina Electrolineras QCUTE SAS', ML + 5, y + 14);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...G.gray);
  doc.text('NIT: 901.993.025-0', ML + 5, y + 20);
  doc.text('contacto@lumina.com.co', ML + 5, y + 26);
  doc.text('www.luminaELECTROLINERAS.com', ML + 5, y + 32);

  const x2 = ML + cW * 0.52;
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(...G.mid);
  doc.roundedRect(x2, y, bW, bH, 3, 3, 'FD');
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...G.mid);
  doc.text('EMITIDO POR:', x2 + 5, y + 7);
  doc.setFontSize(9); doc.setTextColor(...G.text);
  doc.text(aliado.razon_social, x2 + 5, y + 14);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...G.gray);
  doc.text(`NIT: ${aliado.nit || '—'}`, x2 + 5, y + 20);
  if (aliado.email)    doc.text(aliado.email,    x2 + 5, y + 26);
  if (aliado.contacto) doc.text(aliado.contacto, x2 + 5, y + 32);

  // ── Período ────────────────────────────────────────────────────────────────
  y += bH + 6;
  doc.setFillColor(...G.dark);
  doc.roundedRect(ML, y, cW, 9, 2, 2, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...G.white);
  doc.text(`PERÍODO:  ${fmtD(desde)}  al  ${fmtD(hasta)}`, ML + 4, y + 6.5);

  // ── SECCIÓN: DETALLE POR CARGADOR ──────────────────────────────────────────
  y += 14;
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...G.dark);
  doc.text('ENERGÍA SUMINISTRADA — DETALLE POR CARGADOR', ML, y);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...G.gray);
  doc.text('Consumo registrado por cada equipo cargador instalado en sus instalaciones.', ML, y + 5);
  y += 9;

  // Agrupar sesiones por cargador
  const porCargador = {};
  sesiones.forEach(s => {
    const k = s.charge_point_id;
    if (!porCargador[k]) porCargador[k] = {
      charge_point_id: k,
      charger_model: s.charger_model || '—',
      station_name: s.station_name,
      city: s.city,
      cost_per_kwh: parseFloat(s.cost_per_kwh) || 0,
      sesiones: 0,
      kwh: 0,
      valor: 0,
    };
    porCargador[k].sesiones++;
    porCargador[k].kwh   += parseFloat(s.kwh_used) || 0;
    porCargador[k].valor += parseFloat(s.valor_energia) || 0;
  });

  const cargadores = Object.values(porCargador);
  const totalKwh   = cargadores.reduce((s, c) => s + c.kwh,   0);
  const totalCosto = cargadores.reduce((s, c) => s + c.valor, 0);

  autoTable(doc, {
    startY: y,
    head: [['Equipo / ID Cargador', 'Modelo', 'Estación', 'Ciudad', 'Sesiones', 'kWh consumidos', 'Tarifa pactada', 'Valor energía (COP)']],
    body: cargadores.map(c => [
      c.charge_point_id,
      c.charger_model,
      c.station_name,
      c.city || '—',
      c.sesiones,
      c.kwh.toFixed(3) + ' kWh',
      cop(c.cost_per_kwh) + '/kWh',
      cop(c.valor),
    ]),
    foot: [['', '', '', '', cargadores.reduce((s,c)=>s+c.sesiones,0), totalKwh.toFixed(3) + ' kWh', 'TOTAL A FACTURAR (COP)', cop(totalCosto)]],
    margin: { left: ML, right: ML },
    styles: { fontSize: 8, cellPadding: 3, textColor: G.text },
    headStyles: { fillColor: G.dark, textColor: G.white, fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: G.mid,  textColor: G.white, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 253, 250] },
    columnStyles: {
      4: { halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
    },
  });

  y = doc.lastAutoTable.finalY + 6;

  // ── TOTAL PRINCIPAL ────────────────────────────────────────────────────────
  if (y + 22 > pageH - 30) { doc.addPage(); drawHeader(doc, pageW); y = 52; }
  doc.setFillColor(...G.dark);
  doc.roundedRect(ML, y, cW, 18, 4, 4, 'F');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(...G.white);
  doc.text('TOTAL A FACTURAR POR ENERGÍA', ML + 6, y + 12);
  doc.setFontSize(16); doc.setTextColor(134, 239, 172);
  doc.text(cop(totalCosto), pageW - ML - 5, y + 13, { align: 'right' });
  y += 24;

  // ── SECCIÓN: COMISIÓN (INFORMATIVA) ───────────────────────────────────────
  if (y + 10 > pageH - 40) { doc.addPage(); drawHeader(doc, pageW); y = 52; }
  doc.setFillColor(254, 252, 232);
  doc.setDrawColor(234, 179, 8);
  doc.setLineWidth(0.5);
  doc.roundedRect(ML, y, cW, 9, 2, 2, 'FD');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 80, 0);
  doc.text('INFORMACIÓN ADICIONAL — COMISIÓN POR VENTAS  (referencial, no forma parte de la factura)', ML + 4, y + 6.5);
  y += 13;

  const totalComision = rows.reduce((s, r) => s + (r.comision || 0), 0);
  autoTable(doc, {
    startY: y,
    head: [['Estación', 'Ciudad', '% Comisión pactada', 'Valor referencial (COP)']],
    body: rows.map(r => [r.station_name, r.city || '—', `${r.commission_pct}%`, cop(r.comision)]),
    foot: [['', '', 'TOTAL COMISIÓN (referencial)', cop(totalComision)]],
    margin: { left: ML, right: ML },
    styles: { fontSize: 8, cellPadding: 3, textColor: G.text },
    headStyles: { fillColor: [120, 80, 0], textColor: G.white, fontStyle: 'bold', fontSize: 7.5 },
    footStyles: { fillColor: [180, 120, 0], textColor: G.white, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [255, 253, 244] },
    columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right', fontStyle: 'bold' } },
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── Nota legal ─────────────────────────────────────────────────────────────
  if (y + 18 > pageH - 22) { doc.addPage(); drawHeader(doc, pageW); y = 52; }
  doc.setFillColor(...G.grayL);
  doc.roundedRect(ML, y, cW, 16, 2, 2, 'F');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...G.dark);
  doc.text('Instrucciones de pago:', ML + 5, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...G.gray);
  const nota = 'Favor emitir la factura electrónica a nombre de Lumina Electrolineras QCUTE SAS, NIT 901.993.025-0, por el concepto de energía eléctrica suministrada indicado arriba. El pago se realizará dentro de los 15 días hábiles siguientes a la recepción de la factura.';
  doc.text(doc.splitTextToSize(nota, cW - 10), ML + 5, y + 12);

  // ── Pie en todas las páginas ───────────────────────────────────────────────
  const totalPags = doc.getNumberOfPages();
  for (let p = 1; p <= totalPags; p++) {
    doc.setPage(p);
    drawFooter(doc, p, totalPags, pageW, pageH);
  }

  const safe = aliado.razon_social.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  doc.save(`Lumina_Factura_${safe}_${desde}_${hasta}.pdf`);
}
