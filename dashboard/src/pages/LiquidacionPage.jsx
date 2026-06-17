import React, { useEffect, useState } from 'react';
import api from '../api';
import { T } from '../theme';
import * as XLSX from 'xlsx';
import { generarPDFAliado } from '../utils/luminaPDF';

const cop  = n => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const fmtD = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
const fmtDT = s => s ? new Date(s).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function firstDay() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
function lastDay()  { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10); }

export default function LiquidacionPage() {
  const [desde,     setDesde]     = useState(firstDay());
  const [hasta,     setHasta]     = useState(lastDay());
  const [aliadoFil, setAliadoFil] = useState('');
  const [aliados,   setAliados]   = useState([]);
  const [data,      setData]      = useState([]);
  const [sesiones,  setSesiones]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => { api.get('/aliados').then(setAliados).catch(() => {}); }, []);

  async function generate() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (aliadoFil) params.set('aliado_id', aliadoFil);
      const [resumen, detalle] = await Promise.all([
        api.get(`/aliados/liquidacion?${params}`),
        api.get(`/aliados/liquidacion/detalle?${params}`),
      ]);
      setData(resumen);
      setSesiones(detalle);
      setGenerated(true);
    } catch (e) { alert(e.error || 'Error al generar reporte'); }
    finally { setLoading(false); }
  }

  const totals = data.reduce((acc, r) => ({
    kwh:      acc.kwh      + (r.kwh_total     || 0),
    venta:    acc.venta    + (r.venta_bruta   || 0),
    costo:    acc.costo    + (r.costo_energia || 0),
    comision: acc.comision + (r.comision      || 0),
    total:    acc.total    + (r.total_aliado  || 0),
    neto:     acc.neto     + (r.neto_lumina   || 0),
  }), { kwh: 0, venta: 0, costo: 0, comision: 0, total: 0, neto: 0 });

  // Agrupar resumen por aliado
  const byAliado = {};
  data.forEach(r => {
    const key = r.aliado_id || '__sin__';
    if (!byAliado[key]) byAliado[key] = {
      id: r.aliado_id,
      razon_social: r.razon_social || 'Sin aliado asignado',
      nit: r.nit || '—',
      email: r.aliado_email,
      contacto: r.aliado_contacto,
      rows: [],
    };
    byAliado[key].rows.push(r);
  });

  // Sesiones filtradas por aliado
  function sesionesDeAliado(aliadoId) {
    return aliadoId
      ? sesiones.filter(s => {
          const al = byAliado[aliadoId];
          return al?.rows.some(r => r.station_name === s.station_name);
        })
      : sesiones;
  }

  // ── PDF PROFESIONAL ──────────────────────────────────────────────────────────
  function exportPDF(aliadoKey) {
    const entries = aliadoKey ? [byAliado[aliadoKey]] : Object.values(byAliado).filter(a => a.id);
    entries.forEach(al => {
      const sAl = sesionesDeAliado(al.id);
      generarPDFAliado(al, al.rows, sAl, desde, hasta);
    });
  }

  // ── EXCEL DETALLADO ──────────────────────────────────────────────────────────
  function exportExcel(aliadoKey) {
    const entries = aliadoKey ? [byAliado[aliadoKey]] : Object.values(byAliado);
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen ejecutivo (uso interno Lumina)
    const sumRows = [
      ['LUMINA ELECTROLINERAS QCUTE SAS — LIQUIDACIÓN MENSUAL'],
      [`Período: ${fmtD(desde)}  al  ${fmtD(hasta)}`],
      [`Generado: ${new Date().toLocaleString('es-CO')}`],
      [],
      ['Aliado / Razón Social', 'NIT', 'Estación', 'Ciudad', 'Sesiones',
       'kWh consumidos', 'Venta bruta (COP)', 'Costo energía (COP)',
       'Comisión %', 'Comisión (COP)', 'Total aliado (COP)', 'Neto Lumina (COP)'],
    ];
    entries.forEach(al => {
      al.rows.forEach(r => {
        sumRows.push([
          al.razon_social, al.nit, r.station_name, r.city || '',
          r.sesiones, parseFloat(r.kwh_total.toFixed(3)),
          Math.round(r.venta_bruta), Math.round(r.costo_energia),
          `${r.commission_pct}%`, Math.round(r.comision),
          Math.round(r.total_aliado), Math.round(r.neto_lumina),
        ]);
      });
      const sub = al.rows.reduce((a,r) => ({
        kwh: a.kwh+r.kwh_total, venta: a.venta+r.venta_bruta,
        cos: a.cos+r.costo_energia, com: a.com+r.comision,
        tot: a.tot+r.total_aliado, net: a.net+r.neto_lumina,
      }), { kwh:0, venta:0, cos:0, com:0, tot:0, net:0 });
      sumRows.push([`SUBTOTAL — ${al.razon_social}`,'','','','',
        parseFloat(sub.kwh.toFixed(3)), Math.round(sub.venta), Math.round(sub.cos),
        '', Math.round(sub.com), Math.round(sub.tot), Math.round(sub.net)]);
      sumRows.push([]);
    });
    sumRows.push(['TOTAL GENERAL','','','','',
      parseFloat(totals.kwh.toFixed(3)), Math.round(totals.venta), Math.round(totals.costo),
      '', Math.round(totals.comision), Math.round(totals.total), Math.round(totals.neto)]);

    const ws = XLSX.utils.aoa_to_sheet(sumRows);
    ws['!cols'] = [36,18,28,14,9,16,18,18,10,16,18,18].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, 'Resumen Liquidacion');

    // Hoja 2: Detalle por cargador (por aliado)
    entries.forEach(al => {
      if (al.razon_social === 'Sin aliado asignado') return;
      const sAl = sesionesDeAliado(al.id);

      // Agrupar por cargador
      const porCarg = {};
      sAl.forEach(s => {
        const k = s.charge_point_id;
        if (!porCarg[k]) porCarg[k] = { id: k, model: s.charger_model||'—', station: s.station_name, city: s.city||'—', kwh: 0, sesiones: 0, valor: 0, tarifa: parseFloat(s.cost_per_kwh)||0 };
        porCarg[k].sesiones++;
        porCarg[k].kwh   += parseFloat(s.kwh_used)     || 0;
        porCarg[k].valor += parseFloat(s.valor_energia) || 0;
      });
      const cArgs = Object.values(porCarg);

      const cargRows = [
        [`DETALLE POR CARGADOR — ${al.razon_social}`],
        [`NIT: ${al.nit}  |  Período: ${fmtD(desde)} al ${fmtD(hasta)}`],
        [],
        ['ID Cargador', 'Modelo', 'Estación', 'Ciudad', 'Sesiones', 'kWh consumidos', 'Tarifa (COP/kWh)', 'Valor energía (COP)'],
        ...cArgs.map(c => [c.id, c.model, c.station, c.city, c.sesiones, parseFloat(c.kwh.toFixed(3)), Math.round(c.tarifa), Math.round(c.valor)]),
        [],
        ['TOTALES','','','',
          cArgs.reduce((s,c)=>s+c.sesiones,0),
          parseFloat(cArgs.reduce((s,c)=>s+c.kwh,0).toFixed(3)),
          '',
          Math.round(cArgs.reduce((s,c)=>s+c.valor,0))],
      ];

      const wsCarg = XLSX.utils.aoa_to_sheet(cargRows);
      wsCarg['!cols'] = [28,18,28,14,10,16,16,18].map(w=>({wch:w}));
      const nameCarg = ('Carg_' + al.razon_social).slice(0,28).replace(/[:\\/?*[\]]/g,'');
      XLSX.utils.book_append_sheet(wb, wsCarg, nameCarg);
    });

    // Hoja 3: Sesiones individuales (todas)
    const sesAll = aliadoKey ? sesionesDeAliado(byAliado[aliadoKey]?.id) : sesiones;
    const sesRows = [
      ['DETALLE DE SESIONES INDIVIDUALES'],
      [`Período: ${fmtD(desde)} al ${fmtD(hasta)}`],
      [],
      ['Aliado', 'Estación', 'Ciudad', 'ID Cargador', 'Modelo', 'Usuario', 'Email usuario',
       'Inicio', 'Fin', 'Duración (min)', 'kWh consumidos', 'Tarifa (COP/kWh)', 'Valor energía (COP)'],
      ...sesAll.map(s => [
        s.razon_social || '—', s.station_name, s.city || '—',
        s.charge_point_id, s.charger_model || '—',
        s.user_name || '—', s.user_email || '—',
        fmtDT(s.started_at), fmtDT(s.ended_at),
        s.duracion_min || 0,
        parseFloat(parseFloat(s.kwh_used||0).toFixed(3)),
        Math.round(s.cost_per_kwh || 0),
        Math.round(s.valor_energia || 0),
      ]),
      [],
      // Fila de totales al final
      ['', '', '', '', '', '', '', '', 'TOTAL',
        sesAll.reduce((s,r)=>s+(r.duracion_min||0), 0),
        parseFloat(sesAll.reduce((s,r)=>s+parseFloat(r.kwh_used||0),0).toFixed(3)),
        '',
        Math.round(sesAll.reduce((s,r)=>s+parseFloat(r.valor_energia||0),0))],
    ];

    const wsSes = XLSX.utils.aoa_to_sheet(sesRows);
    wsSes['!cols'] = [28,24,12,24,16,20,24,18,18,12,14,14,18].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, wsSes, 'Sesiones Detalle');

    const fname = `Lumina_Detalle_${desde}_${hasta}${aliadoKey ? '_'+entries[0]?.razon_social?.slice(0,15) : ''}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: T.text, fontSize: 26, fontWeight: 800, margin: 0 }}>Liquidación Mensual</h1>
        <div style={{ color: T.textMuted, fontSize: 13, marginTop: 2 }}>
          PDF con detalle por cargador · Excel con sesiones individuales verificables
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 16, alignItems: 'end' }}>
          <div>
            <label style={lbl}>Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={lbl}>Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={lbl}>Aliado (todos si no se selecciona)</label>
            <select value={aliadoFil} onChange={e => setAliadoFil(e.target.value)} style={{ ...sel, width: '100%' }}>
              <option value="">Todos los aliados</option>
              {aliados.map(a => <option key={a.id} value={a.id}>{a.razon_social} — NIT {a.nit}</option>)}
            </select>
          </div>
          <button onClick={generate} disabled={loading} style={{
            background: T.primary, color: '#fff', border: 'none', borderRadius: 12,
            padding: '12px 28px', fontWeight: 700, fontSize: 15, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            {loading ? '⏳ Calculando...' : '📊 Generar reporte'}
          </button>
        </div>
      </div>

      {generated && data.length > 0 && (
        <>
          {/* Tarjetas resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'kWh totales',         value: `${totals.kwh.toFixed(2)} kWh`, color: '#2563eb', bg: '#eff6ff' },
              { label: 'Venta bruta',          value: cop(totals.venta),              color: T.primary,  bg: '#f0fdf4' },
              { label: 'Total pagar aliados',  value: cop(totals.total),              color: '#b45309',  bg: '#fffbeb' },
              { label: 'Neto Lumina',          value: cop(totals.neto),               color: '#16a34a',  bg: '#f0fdf4' },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, borderRadius: 14, padding: '18px 20px', border: `1.5px solid ${c.color}22` }}>
                <div style={{ color: c.color, fontWeight: 800, fontSize: 22 }}>{c.value}</div>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Panel exportación */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.text, marginBottom: 16 }}>Exportar documentos</div>

            {/* PDF */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600, marginBottom: 8 }}>
                PDF PROFESIONAL — Solicitud de factura con detalle por cargador, comisión referencial y branding Lumina
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => exportPDF('')} style={btnPDF}>
                  Generar PDF — Todos los aliados
                </button>
                {Object.entries(byAliado).filter(([k]) => k !== '__sin__').map(([id, al]) => (
                  <button key={id} onClick={() => exportPDF(id)} style={btnPDFSec}>
                    PDF — {al.razon_social.slice(0, 24)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 18 }}>
              <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600, marginBottom: 8 }}>
                EXCEL DETALLADO — 3 hojas: Resumen ejecutivo · Detalle por cargador · Sesiones individuales (totales verificables)
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => exportExcel('')} style={btnXLS}>
                  Excel — Todos los aliados
                </button>
                {Object.entries(byAliado).filter(([k]) => k !== '__sin__').map(([id, al]) => (
                  <button key={id} onClick={() => exportExcel(id)} style={btnXLSSec}>
                    Excel — {al.razon_social.slice(0, 24)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tabla por aliado */}
          {Object.values(byAliado).map((al, i) => {
            const subTot = al.rows.reduce((s, r) => s + (r.total_aliado || 0), 0);
            const subKwh = al.rows.reduce((s, r) => s + (r.kwh_total   || 0), 0);
            const sAl    = sesionesDeAliado(al.id);
            return (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: T.text }}>{al.razon_social}</div>
                    <div style={{ color: T.textMuted, fontSize: 13 }}>NIT: {al.nit} {al.email ? `· ${al.email}` : ''}</div>
                    <div style={{ color: '#2563eb', fontSize: 13, marginTop: 2 }}>{subKwh.toFixed(2)} kWh · {sAl.length} sesiones</div>
                  </div>
                  <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '12px 20px', textAlign: 'right' }}>
                    <div style={{ color: '#16a34a', fontWeight: 800, fontSize: 20 }}>{cop(subTot)}</div>
                    <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>Total a facturar</div>
                  </div>
                </div>

                {/* Tabla estaciones */}
                <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        {['Estación','Ciudad','Ses.','kWh','Energía (COP)','Comisión %','Comisión','Total aliado','Neto Lumina'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', color: T.textMuted, fontWeight: 600, textAlign: 'right', fontSize: 11 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {al.rows.map(r => (
                        <tr key={r.station_id} style={{ borderTop: `1px solid ${T.borderCard}` }}>
                          <td style={{ padding: '9px 12px', color: T.text, fontWeight: 700, textAlign: 'left' }}>{r.station_name}</td>
                          <td style={{ padding: '9px 12px', color: T.textMuted, textAlign: 'right' }}>{r.city || '—'}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right' }}>{r.sesiones}</td>
                          <td style={{ padding: '9px 12px', color: '#2563eb', fontWeight: 700, textAlign: 'right' }}>{parseFloat(r.kwh_total).toFixed(2)}</td>
                          <td style={{ padding: '9px 12px', color: '#b45309', fontWeight: 600, textAlign: 'right' }}>{cop(r.costo_energia)}</td>
                          <td style={{ padding: '9px 12px', color: T.textMuted, textAlign: 'right' }}>{r.commission_pct}%</td>
                          <td style={{ padding: '9px 12px', color: '#b45309', textAlign: 'right' }}>{cop(r.comision)}</td>
                          <td style={{ padding: '9px 12px', color: '#dc2626', fontWeight: 800, textAlign: 'right' }}>{cop(r.total_aliado)}</td>
                          <td style={{ padding: '9px 12px', color: '#16a34a', fontWeight: 800, textAlign: 'right' }}>{cop(r.neto_lumina)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mini-tabla de cargadores */}
                {sAl.length > 0 && (() => {
                  const porCarg = {};
                  sAl.forEach(s => {
                    const k = s.charge_point_id;
                    if (!porCarg[k]) porCarg[k] = { id: k, station: s.station_name, sesiones: 0, kwh: 0, valor: 0 };
                    porCarg[k].sesiones++;
                    porCarg[k].kwh   += parseFloat(s.kwh_used)     || 0;
                    porCarg[k].valor += parseFloat(s.valor_energia) || 0;
                  });
                  return (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, marginBottom: 6 }}>Detalle por cargador</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#f0fdf4' }}>
                              {['ID Cargador','Estación','Sesiones','kWh','Valor energía (COP)'].map(h => (
                                <th key={h} style={{ padding: '6px 10px', color: '#16a34a', fontWeight: 700, textAlign: 'right', fontSize: 11 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.values(porCarg).map(c => (
                              <tr key={c.id} style={{ borderTop: '1px solid #dcfce7' }}>
                                <td style={{ padding: '7px 10px', color: T.text, fontWeight: 600, textAlign: 'left', fontFamily: 'monospace' }}>{c.id}</td>
                                <td style={{ padding: '7px 10px', color: T.textMuted, textAlign: 'right' }}>{c.station}</td>
                                <td style={{ padding: '7px 10px', textAlign: 'right' }}>{c.sesiones}</td>
                                <td style={{ padding: '7px 10px', color: '#2563eb', fontWeight: 700, textAlign: 'right' }}>{c.kwh.toFixed(3)}</td>
                                <td style={{ padding: '7px 10px', color: '#b45309', fontWeight: 700, textAlign: 'right' }}>{cop(c.valor)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </>
      )}

      {generated && !data.length && (
        <div style={{ color: T.textMuted, textAlign: 'center', padding: 60 }}>
          No hay sesiones completadas en el período seleccionado.
        </div>
      )}
    </div>
  );
}

const inp    = { background: '#f8fafc', color: '#0f172a', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none' };
const sel    = { background: '#f8fafc', color: '#0f172a', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none', cursor: 'pointer' };
const lbl    = { color: '#64748b', fontSize: 12, display: 'block', marginBottom: 5, fontWeight: 600 };
const btnPDF    = { background: '#052e16', color: '#4ade80', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnPDFSec = { background: '#fff', color: '#052e16', border: '1.5px solid #16a34a', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const btnXLS    = { background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnXLSSec = { background: '#fff', color: '#15803d', border: '1.5px solid #86efac', borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
