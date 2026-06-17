import React, { useEffect, useState } from 'react';
import api from '../api';
import { T } from '../theme';
import * as XLSX from 'xlsx';

const cop  = n => `$${Math.round(n||0).toLocaleString('es-CO')}`;
const fmtD = s => s ? new Date(s+'T00:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'long',year:'numeric'}) : '';

function firstDay() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}
function lastDay() {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10);
}

export default function LiquidacionPage() {
  const [desde,       setDesde]       = useState(firstDay());
  const [hasta,       setHasta]       = useState(lastDay());
  const [aliadoFil,   setAliadoFil]   = useState('');
  const [aliados,     setAliados]     = useState([]);
  const [data,        setData]        = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [generated,   setGenerated]   = useState(false);

  useEffect(() => { api.get('/aliados').then(setAliados).catch(()=>{}); }, []);

  async function generate() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (aliadoFil) params.set('aliado_id', aliadoFil);
      const res = await api.get(`/aliados/liquidacion?${params}`);
      setData(res); setGenerated(true);
    } catch(e) { alert(e.error||'Error'); }
    finally { setLoading(false); }
  }

  // Totales
  const totals = data.reduce((acc, r) => ({
    kwh:      acc.kwh      + (r.kwh_total     || 0),
    venta:    acc.venta    + (r.venta_bruta   || 0),
    costo:    acc.costo    + (r.costo_energia || 0),
    comision: acc.comision + (r.comision      || 0),
    total:    acc.total    + (r.total_aliado  || 0),
    neto:     acc.neto     + (r.neto_lumina   || 0),
  }), { kwh:0, venta:0, costo:0, comision:0, total:0, neto:0 });

  // Agrupar por aliado
  const byAliado = {};
  data.forEach(r => {
    const key = r.aliado_id || '__sin__';
    if (!byAliado[key]) byAliado[key] = { razon_social: r.razon_social || 'Sin aliado asignado', nit: r.nit || '—', email: r.aliado_email, rows: [] };
    byAliado[key].rows.push(r);
  });

  function exportExcel(aliadoId) {
    const entries = aliadoId ? [byAliado[aliadoId]] : Object.values(byAliado);
    const wb = XLSX.utils.book_new();

    // Hoja resumen
    const sumRows = [
      ['LUMINA ELECTROLINERAS — LIQUIDACIÓN MENSUAL'],
      [`Período: ${fmtD(desde)}  al  ${fmtD(hasta)}`],
      [`Generado: ${new Date().toLocaleString('es-CO')}`],
      [],
      ['Aliado / Razón Social', 'NIT', 'Estación', 'Ciudad', 'Sesiones', 'kWh consumidos',
       'Venta bruta', `Costo energía ($/kWh)`, `Comisión %`, 'Comisión ($)', 'Total a pagar aliado', 'Neto Lumina'],
    ];
    entries.forEach(al => {
      al.rows.forEach(r => {
        sumRows.push([
          al.razon_social, al.nit, r.station_name, r.city||'', r.sesiones,
          parseFloat(r.kwh_total.toFixed(3)),
          Math.round(r.venta_bruta),
          `${cop(r.cost_per_kwh)}/kWh`,
          `${r.commission_pct}%`,
          Math.round(r.comision),
          Math.round(r.total_aliado),
          Math.round(r.neto_lumina),
        ]);
      });
      // Subtotal por aliado
      const sub = al.rows.reduce((a,r)=>({ kwh:a.kwh+r.kwh_total, venta:a.venta+r.venta_bruta, com:a.com+r.comision, total:a.total+r.total_aliado, neto:a.neto+r.neto_lumina }),{kwh:0,venta:0,com:0,total:0,neto:0});
      sumRows.push(['SUBTOTAL '+al.razon_social,'','','','', parseFloat(sub.kwh.toFixed(3)), Math.round(sub.venta),'','',Math.round(sub.com),Math.round(sub.total),Math.round(sub.neto)]);
      sumRows.push([]);
    });
    sumRows.push(['TOTAL GENERAL','','','','', parseFloat(totals.kwh.toFixed(3)), Math.round(totals.venta),'','',Math.round(totals.comision),Math.round(totals.total),Math.round(totals.neto)]);

    const ws = XLSX.utils.aoa_to_sheet(sumRows);
    ws['!cols'] = [36,18,28,16,10,16,16,20,12,16,22,16].map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb, ws, 'Liquidación');

    // Hoja por aliado (solicitud de factura)
    entries.forEach(al => {
      if (al.razon_social === 'Sin aliado asignado') return;
      const sub = al.rows.reduce((a,r)=>({ kwh:a.kwh+r.kwh_total, costo:a.costo+r.costo_energia, com:a.com+r.comision, total:a.total+r.total_aliado }),{kwh:0,costo:0,com:0,total:0});
      const sheet = [
        ['SOLICITUD DE FACTURACIÓN'],
        [`Aliado: ${al.razon_social}`],
        [`NIT: ${al.nit}`],
        [`Período: ${fmtD(desde)} al ${fmtD(hasta)}`],
        [],
        ['Concepto', 'Detalle', 'Valor (COP)'],
      ];
      al.rows.forEach(r => {
        sheet.push([`Energía suministrada — ${r.station_name}`, `${parseFloat(r.kwh_total.toFixed(3))} kWh × ${cop(r.cost_per_kwh)}/kWh`, Math.round(r.costo_energia)]);
        sheet.push([`Comisión por ventas — ${r.station_name}`, `${r.commission_pct}% sobre ${cop(r.venta_bruta)}`, Math.round(r.comision)]);
      });
      sheet.push([]);
      sheet.push(['TOTAL A FACTURAR', '', Math.round(sub.total)]);
      sheet.push([]);
      sheet.push(['Facturar a:', 'Lumina Electrolineras SAS', '']);
      const wsal = XLSX.utils.aoa_to_sheet(sheet);
      wsal['!cols'] = [{wch:40},{wch:38},{wch:18}];
      const sheetName = al.razon_social.slice(0,28).replace(/[:\\/?*[\]]/g,'');
      XLSX.utils.book_append_sheet(wb, wsal, sheetName);
    });

    const fname = `Lumina_Liquidacion_${desde}_${hasta}${aliadoId ? '_'+entries[0]?.razon_social?.slice(0,15) : ''}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ color:T.text, fontSize:26, fontWeight:800, margin:0 }}>Liquidación Mensual</h1>
          <div style={{ color:T.textMuted, fontSize:13, marginTop:2 }}>Genera reportes de consumo y solicitudes de facturación para aliados</div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background:'#fff', borderRadius:16, padding:24, boxShadow:'0 2px 12px rgba(0,0,0,0.06)', marginBottom:24 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr auto', gap:16, alignItems:'end' }}>
          <div>
            <label style={lbl}>Desde</label>
            <input type="date" value={desde} onChange={e=>setDesde(e.target.value)} style={{...inp,width:'100%'}} />
          </div>
          <div>
            <label style={lbl}>Hasta</label>
            <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} style={{...inp,width:'100%'}} />
          </div>
          <div>
            <label style={lbl}>Aliado (opcional — todos si no se selecciona)</label>
            <select value={aliadoFil} onChange={e=>setAliadoFil(e.target.value)} style={{...sel,width:'100%'}}>
              <option value="">Todos los aliados</option>
              {aliados.map(a=><option key={a.id} value={a.id}>{a.razon_social} — NIT {a.nit}</option>)}
            </select>
          </div>
          <button onClick={generate} disabled={loading} style={{ background:T.primary, color:'#fff', border:'none', borderRadius:12, padding:'12px 28px', fontWeight:700, fontSize:15, cursor:'pointer', whiteSpace:'nowrap' }}>
            {loading ? '⏳ Calculando...' : '📊 Generar reporte'}
          </button>
        </div>
      </div>

      {generated && data.length > 0 && (
        <>
          {/* Resumen de totales */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
            {[
              { label:'kWh totales consumidos', value:`${totals.kwh.toFixed(2)} kWh`, color:'#2563eb', bg:'#eff6ff' },
              { label:'Venta bruta usuarios',   value:cop(totals.venta),              color:T.primary,  bg:'#f0fdf4' },
              { label:'Total a pagar aliados',  value:cop(totals.total),              color:'#b45309',  bg:'#fffbeb' },
              { label:'Neto Lumina',            value:cop(totals.neto),               color:'#16a34a',  bg:'#f0fdf4' },
            ].map(c=>(
              <div key={c.label} style={{ background:c.bg, borderRadius:14, padding:'18px 20px', border:`1.5px solid ${c.color}22` }}>
                <div style={{ color:c.color, fontWeight:800, fontSize:22 }}>{c.value}</div>
                <div style={{ color:'#64748b', fontSize:12, marginTop:4 }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Botones exportar */}
          <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
            <button onClick={()=>exportExcel('')} style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', fontWeight:700, fontSize:14, cursor:'pointer' }}>
              📥 Exportar Excel — Todos los aliados
            </button>
            {Object.entries(byAliado).filter(([k])=>k!=='__sin__').map(([id, al])=>(
              <button key={id} onClick={()=>exportExcel(id)} style={{ background:'#fff', color:T.text, border:`1.5px solid ${T.borderCard}`, borderRadius:10, padding:'10px 18px', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                📄 {al.razon_social}
              </button>
            ))}
          </div>

          {/* Tabla por aliado */}
          {Object.values(byAliado).map((al,i) => (
            <div key={i} style={{ background:'#fff', borderRadius:16, padding:24, boxShadow:'0 2px 12px rgba(0,0,0,0.06)', marginBottom:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:17, color:T.text }}>{al.razon_social}</div>
                  <div style={{ color:T.textMuted, fontSize:13 }}>NIT: {al.nit} {al.email ? `· ${al.email}` : ''}</div>
                </div>
                <div style={{ background:'#f0fdf4', borderRadius:10, padding:'8px 16px', textAlign:'right' }}>
                  <div style={{ color:'#16a34a', fontWeight:800, fontSize:18 }}>{cop(al.rows.reduce((s,r)=>s+r.total_aliado,0))}</div>
                  <div style={{ color:T.textMuted, fontSize:11 }}>Total a facturar</div>
                </div>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['Estación','Ciudad','Sesiones','kWh','Venta bruta','Costo/kWh','Costo energía','Comisión %','Comisión $','Total aliado','Neto Lumina'].map(h=>(
                        <th key={h} style={{ padding:'10px 14px', color:T.textMuted, fontWeight:600, textAlign:'right', fontSize:11, whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {al.rows.map(r=>(
                      <tr key={r.station_id} style={{ borderTop:`1px solid ${T.borderCard}` }}>
                        <td style={{ padding:'11px 14px', color:T.text, fontWeight:700, textAlign:'left', whiteSpace:'nowrap' }}>{r.station_name}</td>
                        <td style={{ padding:'11px 14px', color:T.textMuted, textAlign:'right' }}>{r.city||'—'}</td>
                        <td style={{ padding:'11px 14px', color:T.text, fontWeight:600, textAlign:'right' }}>{r.sesiones}</td>
                        <td style={{ padding:'11px 14px', color:'#2563eb', fontWeight:700, textAlign:'right' }}>{parseFloat(r.kwh_total).toFixed(2)}</td>
                        <td style={{ padding:'11px 14px', color:T.textMuted, textAlign:'right' }}>{cop(r.venta_bruta)}</td>
                        <td style={{ padding:'11px 14px', color:T.textMuted, textAlign:'right' }}>{cop(r.cost_per_kwh)}</td>
                        <td style={{ padding:'11px 14px', color:'#b45309', fontWeight:600, textAlign:'right' }}>{cop(r.costo_energia)}</td>
                        <td style={{ padding:'11px 14px', color:T.textMuted, textAlign:'right' }}>{r.commission_pct}%</td>
                        <td style={{ padding:'11px 14px', color:'#b45309', textAlign:'right' }}>{cop(r.comision)}</td>
                        <td style={{ padding:'11px 14px', color:'#dc2626', fontWeight:800, textAlign:'right' }}>{cop(r.total_aliado)}</td>
                        <td style={{ padding:'11px 14px', color:'#16a34a', fontWeight:800, textAlign:'right' }}>{cop(r.neto_lumina)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}

      {generated && !data.length && (
        <div style={{ color:T.textMuted, textAlign:'center', padding:60 }}>
          No hay sesiones completadas en el período seleccionado.
        </div>
      )}
    </div>
  );
}

const inp = { background:'#f8fafc', color:'#0f172a', border:'1.5px solid #e2e8f0', borderRadius:10, padding:'11px 14px', fontSize:14, outline:'none' };
const sel = { background:'#f8fafc', color:'#0f172a', border:'1.5px solid #e2e8f0', borderRadius:10, padding:'11px 14px', fontSize:14, outline:'none', cursor:'pointer' };
const lbl = { color:'#64748b', fontSize:12, display:'block', marginBottom:5, fontWeight:600 };
