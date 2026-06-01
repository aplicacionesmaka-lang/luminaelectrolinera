import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, Legend,
} from 'recharts';
import api from '../api';
import { T } from '../theme';

const cop  = n => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const pct  = n => `${(n || 0).toFixed(1)}%`;

function StatCard({ icon, title, value, sub, color }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 22, borderLeft: `4px solid ${color || T.primary}`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 26, marginBottom: 6 }}>{icon}</div>
      <div style={{ color: T.textMuted, fontSize: 13, marginBottom: 4 }}>{title}</div>
      <div style={{ color: T.text, fontSize: 22, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ color: T.textMuted, fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const ChartCard = ({ title, children }) => (
  <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 20 }}>
    <div style={{ color: T.text, fontSize: 15, fontWeight: 700, marginBottom: 18 }}>{title}</div>
    {children}
  </div>
);

const customTooltip = (prefix = '') => ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.borderCard}`, borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ color: T.textMuted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>
          {p.name}: {prefix === 'cop' ? cop(p.value) : `${p.value} ${prefix}`}
        </div>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [stFilter, setStFilter] = useState('');
  const [view,    setView]    = useState('mes');  // mes | dia

  const load = (sid = '') => {
    setLoading(true); setError('');
    const params = sid ? `?stationId=${sid}` : '';
    api.get(`/sessions/analytics${params}`)
      .then(setData)
      .catch(e => setError(e.error || 'Error cargando datos'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleStation = e => {
    setStFilter(e.target.value);
    load(e.target.value);
  };

  const chartData = useMemo(() => view === 'mes' ? data?.monthData : data?.dayData, [data, view]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
        <div style={{ color: T.textMuted }}>Cargando analytics...</div>
      </div>
    </div>
  );

  if (error) return <div style={{ color: T.danger, padding: 20 }}>{error}</div>;
  if (!data) return null;

  const { totals, stationData, chargerTime, stations } = data;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ color: T.text, fontSize: 26, fontWeight: 800, margin: 0 }}>Dashboard</h1>
          <div style={{ color: T.textMuted, fontSize: 13, marginTop: 2 }}>Últimos 3 meses · Datos en tiempo real</div>
        </div>
        {/* Filtro estación */}
        <select value={stFilter} onChange={handleStation} style={{
          background: '#fff', color: T.text, border: `1.5px solid ${T.border}`,
          borderRadius: 10, padding: '10px 16px', fontSize: 14, outline: 'none', cursor: 'pointer', fontWeight: 600,
        }}>
          <option value="">🗺 Todas las estaciones</option>
          {stations.map(s => <option key={s.id} value={s.id}>{s.name} — {s.city}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard icon="🔌" title="Sesiones totales"   value={totals.sessions.toLocaleString('es-CO')} color={T.primary} />
        <StatCard icon="⚡" title="Energía entregada"  value={`${totals.kwh.toLocaleString('es-CO')} kWh`} color={T.blue} />
        <StatCard icon="💰" title="Ingresos totales"   value={cop(totals.revenue)} sub={`~$${Math.round(totals.revenue/4200).toLocaleString('es-CO')} USD`} color={T.cyan} />
        <StatCard icon="📍" title="Estaciones activas" value={stationData.length} color={T.purple} />
      </div>

      {/* Gráfica ingresos / kWh por tiempo */}
      <ChartCard title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Ingresos & kWh por {view === 'mes' ? 'mes' : 'día (últimos 30)'}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {['mes','dia'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                background: view === v ? T.primary : '#f1f5f9', color: view === v ? '#fff' : T.textMuted,
                border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}>{v === 'mes' ? 'Por mes' : 'Por día'}</button>
            ))}
          </div>
        </div>
      }>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey={view === 'mes' ? 'month' : 'day'} stroke={T.textMuted} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="rev" orientation="left"  stroke={T.textMuted} tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
            <YAxis yAxisId="kwh" orientation="right" stroke={T.textMuted} tick={{ fontSize: 11 }} tickFormatter={v => `${v}kWh`} />
            <Tooltip content={customTooltip('cop')} />
            <Legend />
            <Bar yAxisId="rev" dataKey="revenue" name="Ingresos COP" fill={T.primary} radius={[4,4,0,0]} />
            <Bar yAxisId="kwh" dataKey="kwh"     name="kWh"         fill={T.blue}    radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Por estación */}
        <ChartCard title="Ingresos por estación">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stationData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" stroke={T.textMuted} tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
              <YAxis dataKey="name" type="category" width={110} stroke={T.textMuted} tick={{ fontSize: 11 }} />
              <Tooltip content={customTooltip('cop')} />
              <Bar dataKey="revenue" name="Ingresos" fill={T.cyan} radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* kWh por estación */}
        <ChartCard title="kWh entregados por estación">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stationData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" stroke={T.textMuted} tick={{ fontSize: 11 }} tickFormatter={v => `${v}kWh`} />
              <YAxis dataKey="name" type="category" width={110} stroke={T.textMuted} tick={{ fontSize: 11 }} />
              <Tooltip content={customTooltip('kWh')} />
              <Bar dataKey="kwh" name="kWh" fill={T.primary} radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Tabla de cargadores con tiempos */}
      <ChartCard title="Tiempos por cargador — Activo · Inactivo (90 días, ventana 16h/día)">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {['Cargador','Modelo','kW','Sesiones','kWh','Ingresos','Tiempo activo','Tiempo inactivo','Utilización'].map(h => (
                <th key={h} style={{ padding: '8px 10px', color: T.textMuted, fontWeight: 600, textAlign: 'left', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chargerTime.map(c => (
              <tr key={c.chargePointId} style={{ borderBottom: `1px solid ${T.borderCard}` }}>
                <td style={td}><span style={{ fontWeight: 700, color: T.text }}>{c.chargePointId}</span></td>
                <td style={td}><span style={{ background: '#f0fdf4', color: T.primary, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>{c.model || '—'}</span></td>
                <td style={td}>{c.powerKw}</td>
                <td style={td}>{c.sessions}</td>
                <td style={td}><span style={{ color: T.blue, fontWeight: 600 }}>{c.kwh.toLocaleString('es-CO')}</span></td>
                <td style={td}>{cop(c.revenue)}</td>
                <td style={td}>
                  <span style={{ color: T.success, fontWeight: 600 }}>{c.activeHrs}h</span>
                  <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2, width: 60, marginTop: 3 }}>
                    <div style={{ height: '100%', width: `${c.utilPct}%`, background: T.success, borderRadius: 2 }} />
                  </div>
                </td>
                <td style={td}><span style={{ color: T.warning }}>{c.idleHrs.toLocaleString('es-CO')}h</span></td>
                <td style={td}>
                  <span style={{
                    background: c.utilPct >= 40 ? '#f0fdf4' : c.utilPct >= 20 ? '#fefce8' : '#fef2f2',
                    color:      c.utilPct >= 40 ? T.primary : c.utilPct >= 20 ? T.warning : T.danger,
                    borderRadius: 8, padding: '4px 10px', fontWeight: 700, fontSize: 12,
                  }}>{pct(c.utilPct)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 16, display: 'flex', gap: 24, padding: '12px 0', borderTop: `1px solid ${T.border}`, fontSize: 12 }}>
          <LegendItem color={T.success} label="Tiempo activo — cargador con vehículo conectado" />
          <LegendItem color={T.warning} label="Tiempo inactivo — disponible pero sin uso" />
          <LegendItem color={T.danger}  label="< 20% utilización — revisar ubicación o demanda" />
        </div>
      </ChartCard>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
      <span style={{ color: T.textMuted }}>{label}</span>
    </div>
  );
}

const td = { padding: '11px 10px', color: '#334155' };
