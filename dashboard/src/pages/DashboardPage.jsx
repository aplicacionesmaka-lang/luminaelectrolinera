import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, Legend,
} from 'recharts';
import api from '../api';
import { T } from '../theme';

const cop = n => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const pct = n => `${(n || 0).toFixed(1)}%`;

// Períodos predefinidos
const now = new Date();
const y   = now.getFullYear();
const m   = now.getMonth();

function pad(n) { return String(n).padStart(2, '0'); }
function lastOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

const PERIODOS = [
  {
    label: 'Este mes',
    desde: `${y}-${pad(m+1)}-01`,
    hasta: `${y}-${pad(m+1)}-${pad(lastOfMonth(y, m))}`,
    vista: 'dia',
  },
  {
    label: 'Mes anterior',
    desde: `${m === 0 ? y-1 : y}-${pad(m === 0 ? 12 : m)}-01`,
    hasta: `${m === 0 ? y-1 : y}-${pad(m === 0 ? 12 : m)}-${pad(lastOfMonth(m === 0 ? y-1 : y, m === 0 ? 11 : m-1))}`,
    vista: 'dia',
  },
  {
    label: 'Últimos 3 meses',
    desde: `${m < 3 ? y-1 : y}-${pad(m < 3 ? m+10 : m-2)}-01`,
    hasta: `${y}-${pad(m+1)}-${pad(lastOfMonth(y, m))}`,
    vista: 'mes',
  },
  {
    label: 'Este año',
    desde: `${y}-01-01`,
    hasta: `${y}-12-31`,
    vista: 'mes',
  },
  { label: 'Personalizado', desde: '', hasta: '', vista: 'dia' },
];

function StatCard({ title, value, sub, color, bg }) {
  return (
    <div style={{ background: bg || '#fff', borderRadius: 16, padding: 22, borderLeft: `4px solid ${color || T.primary}`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ color: '#64748b', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      <div style={{ color: T.text, fontSize: 24, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const ChartTooltip = ({ active, payload, label, prefix }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.borderCard}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
      <div style={{ color: T.textMuted, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 700 }}>
          {p.name}: {prefix === 'cop' ? cop(p.value) : `${p.value} ${prefix}`}
        </div>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [stFilter,  setStFilter]  = useState('');
  const [view,      setView]      = useState('dia');
  const [periodoIdx, setPeriodoIdx] = useState(0);
  const [customDe,  setCustomDe]  = useState(`${y}-${pad(m+1)}-01`);
  const [customHas, setCustomHas] = useState(`${y}-${pad(m+1)}-${pad(lastOfMonth(y, m))}`);

  const periodo = PERIODOS[periodoIdx];
  const desde   = periodoIdx === 4 ? customDe  : periodo.desde;
  const hasta   = periodoIdx === 4 ? customHas : periodo.hasta;

  const load = useCallback((sid = '', de = desde, ha = hasta) => {
    setLoading(true); setError('');
    const p = new URLSearchParams({ desde: de, hasta: ha });
    if (sid) p.set('stationId', sid);
    api.get(`/sessions/analytics?${p}`)
      .then(d => { setData(d); })
      .catch(e => setError(e.error || 'Error cargando datos'))
      .finally(() => setLoading(false));
  }, [desde, hasta]);

  useEffect(() => {
    load(stFilter, desde, hasta);
  }, [desde, hasta, stFilter]);

  // Cambiar período predefinido
  function selectPeriodo(idx) {
    setPeriodoIdx(idx);
    if (idx !== 4) setView(PERIODOS[idx].vista);
  }

  const chartData = useMemo(() => {
    if (!data) return [];
    return view === 'mes' ? data.monthData : data.dayData;
  }, [data, view]);

  // Mostrar todos los días o colapsar si son muchos meses
  const ticks = useMemo(() => {
    if (view === 'dia' && chartData.length <= 31) return undefined; // todos
    if (view === 'dia') return chartData.filter((_, i) => i % 5 === 0).map(d => d.label);
    return undefined;
  }, [view, chartData]);

  if (error) return <div style={{ color: '#ef4444', padding: 20, fontWeight: 600 }}>{error}</div>;

  const { totals, stationData, chargerTime, stations } = data || {};

  return (
    <div>
      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: T.text, fontSize: 26, fontWeight: 800, margin: 0 }}>Dashboard</h1>
          <div style={{ color: T.textMuted, fontSize: 13, marginTop: 2 }}>Ingresos y métricas operacionales</div>
        </div>
        {/* Filtro estación */}
        {stations && (
          <select value={stFilter} onChange={e => setStFilter(e.target.value)} style={{
            background: '#fff', color: T.text, border: `1.5px solid ${T.border}`,
            borderRadius: 10, padding: '10px 16px', fontSize: 14, outline: 'none', cursor: 'pointer', fontWeight: 600,
          }}>
            <option value="">Todas las estaciones</option>
            {stations.map(s => <option key={s.id} value={s.id}>{s.name} — {s.city}</option>)}
          </select>
        )}
      </div>

      {/* ── SELECTOR DE PERÍODO ─────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: T.textMuted, fontWeight: 600, marginBottom: 10 }}>PERÍODO DE ANÁLISIS</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {PERIODOS.map((p, i) => (
            <button key={i} onClick={() => selectPeriodo(i)} style={{
              background: periodoIdx === i ? T.primary : '#f1f5f9',
              color: periodoIdx === i ? '#fff' : T.textMuted,
              border: 'none', borderRadius: 8, padding: '8px 16px',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>{p.label}</button>
          ))}

          {/* Fechas personalizadas */}
          {periodoIdx === 4 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 8 }}>
              <input type="date" value={customDe} onChange={e => setCustomDe(e.target.value)}
                style={{ ...dateInp }} />
              <span style={{ color: T.textMuted, fontSize: 13 }}>al</span>
              <input type="date" value={customHas} onChange={e => setCustomHas(e.target.value)}
                style={{ ...dateInp }} />
            </div>
          )}

          {/* Rango mostrado */}
          {periodoIdx !== 4 && (
            <span style={{ color: T.textMuted, fontSize: 12, marginLeft: 8 }}>
              {desde} → {hasta}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
          <div style={{ textAlign: 'center', color: T.textMuted }}>Cargando datos...</div>
        </div>
      ) : (
        <>
          {/* ── KPIs ──────────────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
            <StatCard title="Sesiones completadas" value={(totals?.sessions || 0).toLocaleString('es-CO')} color={T.primary} />
            <StatCard title="Energía entregada"    value={`${(totals?.kwh || 0).toLocaleString('es-CO')} kWh`} color="#2563eb" />
            <StatCard title="Ingresos del período" value={cop(totals?.revenue)} sub={`Precio por consumo registrado`} color="#16a34a" />
            <StatCard title="Estaciones con ventas" value={stationData?.length || 0} color="#7c3aed" />
          </div>

          {/* ── GRÁFICA PRINCIPAL ──────────────────────────────────────────────── */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 }}>
            {/* Título + toggle día/mes */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ color: T.text, fontSize: 15, fontWeight: 700 }}>
                  Ingresos {view === 'dia' ? 'por día' : 'por mes'}
                </div>
                <div style={{ color: T.textMuted, fontSize: 12, marginTop: 2 }}>
                  {view === 'dia'
                    ? `Días del ${desde} al ${hasta}`
                    : `Meses del período seleccionado`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['dia','Por día'],['mes','Por mes']].map(([v, label]) => (
                  <button key={v} onClick={() => setView(v)} style={{
                    background: view === v ? T.primary : '#f1f5f9',
                    color: view === v ? '#fff' : T.textMuted,
                    border: 'none', borderRadius: 8, padding: '7px 16px',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer',
                  }}>{label}</button>
                ))}
              </div>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} barGap={2} margin={{ left: 10, right: 10, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={T.textMuted}
                  tick={{ fontSize: view === 'dia' && chartData.length > 15 ? 10 : 12 }}
                  interval={view === 'dia' && chartData.length > 20 ? 1 : 0}
                  angle={view === 'dia' && chartData.length > 20 ? -45 : 0}
                  textAnchor={view === 'dia' && chartData.length > 20 ? 'end' : 'middle'}
                  height={view === 'dia' && chartData.length > 20 ? 48 : 28}
                />
                <YAxis
                  yAxisId="rev"
                  orientation="left"
                  stroke={T.textMuted}
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`}
                  width={64}
                />
                <YAxis
                  yAxisId="kwh"
                  orientation="right"
                  stroke={T.textMuted}
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => `${v} kWh`}
                  width={64}
                />
                <Tooltip content={<ChartTooltip prefix="cop" />} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar yAxisId="rev" dataKey="revenue" name="Ingresos (COP)" fill={T.primary}  radius={[4,4,0,0]} maxBarSize={36} />
                <Bar yAxisId="kwh" dataKey="kwh"     name="kWh"            fill="#3b82f6"    radius={[4,4,0,0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>

            {/* Mini resumen debajo del gráfico */}
            {view === 'dia' && chartData.length > 0 && (() => {
              const conVentas = chartData.filter(d => d.revenue > 0);
              const mejor     = [...chartData].sort((a,b) => b.revenue - a.revenue)[0];
              return (
                <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 14, borderTop: `1px solid #f1f5f9`, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: T.textMuted }}>
                    Días con ventas: <strong style={{ color: T.text }}>{conVentas.length} de {chartData.length}</strong>
                  </div>
                  {mejor?.revenue > 0 && (
                    <div style={{ fontSize: 12, color: T.textMuted }}>
                      Mejor día: <strong style={{ color: T.primary }}>Día {mejor.label} — {cop(mejor.revenue)}</strong>
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: T.textMuted }}>
                    Promedio días con ventas: <strong style={{ color: T.text }}>{cop(conVentas.length ? Math.round(conVentas.reduce((s,d)=>s+d.revenue,0)/conVentas.length) : 0)}</strong>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* ── INGRESOS Y KWH POR ESTACIÓN ───────────────────────────────────── */}
          {stationData?.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ color: T.text, fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Ingresos por estación</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stationData} layout="vertical" margin={{ left: 4, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" stroke={T.textMuted} tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`} />
                    <YAxis dataKey="name" type="category" width={120} stroke={T.textMuted} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip prefix="cop" />} />
                    <Bar dataKey="revenue" name="Ingresos" fill="#06b6d4" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ color: T.text, fontSize: 15, fontWeight: 700, marginBottom: 18 }}>kWh entregados por estación</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stationData} layout="vertical" margin={{ left: 4, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" stroke={T.textMuted} tick={{ fontSize: 11 }} tickFormatter={v => `${v} kWh`} />
                    <YAxis dataKey="name" type="category" width={120} stroke={T.textMuted} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip prefix="kWh" />} />
                    <Bar dataKey="kwh" name="kWh" fill={T.primary} radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── TABLA CARGADORES ─────────────────────────────────────────────── */}
          {chargerTime?.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ color: T.text, fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
                Desempeño por cargador — {desde} al {hasta}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Cargador','Modelo','kW','Sesiones','kWh','Ingresos','H. activo','H. inactivo','Utilización'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', color: T.textMuted, fontWeight: 600, textAlign: 'left', fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chargerTime.map(c => (
                      <tr key={c.chargePointId} style={{ borderTop: `1px solid ${T.borderCard}` }}>
                        <td style={td}><span style={{ fontWeight: 700, color: T.text, fontFamily: 'monospace', fontSize: 12 }}>{c.chargePointId}</span></td>
                        <td style={td}><span style={{ background: '#f0fdf4', color: T.primary, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>{c.model || '—'}</span></td>
                        <td style={td}>{c.powerKw}</td>
                        <td style={td}>{c.sessions}</td>
                        <td style={td}><span style={{ color: '#2563eb', fontWeight: 600 }}>{c.kwh} kWh</span></td>
                        <td style={td}><span style={{ fontWeight: 700 }}>{cop(c.revenue)}</span></td>
                        <td style={td}>
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>{c.activeHrs}h</span>
                          <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2, width: 50, marginTop: 4 }}>
                            <div style={{ height: '100%', width: `${Math.min(c.utilPct, 100)}%`, background: '#16a34a', borderRadius: 2 }} />
                          </div>
                        </td>
                        <td style={td}><span style={{ color: '#d97706' }}>{c.idleHrs}h</span></td>
                        <td style={td}>
                          <span style={{
                            background: c.utilPct >= 40 ? '#f0fdf4' : c.utilPct >= 20 ? '#fefce8' : '#fef2f2',
                            color:      c.utilPct >= 40 ? '#16a34a' : c.utilPct >= 20 ? '#d97706' : '#dc2626',
                            borderRadius: 8, padding: '4px 10px', fontWeight: 700, fontSize: 12,
                          }}>{pct(c.utilPct)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sin datos */}
          {!totals?.sessions && !loading && (
            <div style={{ textAlign: 'center', padding: 60, color: T.textMuted, fontSize: 14 }}>
              No hay sesiones completadas en el período seleccionado.
            </div>
          )}
        </>
      )}
    </div>
  );
}

const td      = { padding: '11px 12px', color: '#334155' };
const dateInp = { background: '#f8fafc', color: '#0f172a', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 12px', fontSize: 13, outline: 'none' };
