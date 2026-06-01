import React, { useEffect, useState, useCallback } from 'react';
import api from '../api';
import { T } from '../theme';

export default function SessionsPage() {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState('');
  const [page,    setPage]    = useState(1);
  const PAGE = 20;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: 200 });
    if (status) params.set('status', status);
    api.get(`/sessions?${params}`).then(setData).finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); setPage(1); }, [load]);

  const cop = n => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
  const fmt = iso => iso?.slice(0, 16).replace('T', ' ') || '—';
  const statusStyle = s => ({
    Completed: { color: T.primary, bg: '#f0fdf4' },
    Active:    { color: T.warning, bg: '#fefce8' },
    Faulted:   { color: T.danger,  bg: '#fef2f2' },
  }[s] || { color: T.textMuted, bg: '#f8fafc' });

  const paged = data.slice((page - 1) * PAGE, page * PAGE);
  const pages = Math.ceil(data.length / PAGE);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: T.text, fontSize: 26, fontWeight: 800, margin: 0 }}>Sesiones</h1>
          <div style={{ color: T.textMuted, fontSize: 13, marginTop: 2 }}>{data.length} sesiones cargadas</div>
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{
          background: '#fff', color: T.text, border: `1.5px solid ${T.border}`,
          borderRadius: 10, padding: '10px 16px', fontSize: 14, outline: 'none', cursor: 'pointer',
        }}>
          <option value="">Todos los estados</option>
          <option value="Completed">Completed</option>
          <option value="Active">Active</option>
          <option value="Faulted">Faulted</option>
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        {loading ? (
          <div style={{ color: T.textMuted, textAlign: 'center', padding: 60 }}>Cargando sesiones...</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['ID','Cargador','Ciudad','kWh','Costo','Estado','Inicio','Fin'].map(h => (
                    <th key={h} style={{ padding: '13px 14px', color: T.textMuted, fontWeight: 600, textAlign: 'left', fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map(s => {
                  const ss = statusStyle(s.status);
                  return (
                    <tr key={s.id} style={{ borderTop: `1px solid ${T.borderCard}` }}>
                      <td style={td}>{s.id?.slice(0, 8)}</td>
                      <td style={td}><span style={{ fontWeight: 600, color: T.text }}>{s.chargePointId}</span></td>
                      <td style={td}>{s.city || '—'}</td>
                      <td style={td}><span style={{ color: T.blue, fontWeight: 600 }}>{(s.kwhUsed || 0).toFixed(2)}</span></td>
                      <td style={td}>{cop(s.cost)}</td>
                      <td style={td}>
                        <span style={{ background: ss.bg, color: ss.color, borderRadius: 8, padding: '4px 10px', fontWeight: 700, fontSize: 12 }}>{s.status}</span>
                      </td>
                      <td style={td}>{fmt(s.startedAt)}</td>
                      <td style={td}>{fmt(s.endedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {pages > 1 && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: 16, borderTop: `1px solid ${T.borderCard}` }}>
                {Array.from({ length: pages }, (_, i) => (
                  <button key={i} onClick={() => setPage(i + 1)} style={{
                    background: page === i + 1 ? T.primary : '#f1f5f9',
                    color: page === i + 1 ? '#fff' : T.textMuted,
                    border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 700,
                  }}>{i + 1}</button>
                ))}
              </div>
            )}
            {!paged.length && <div style={{ color: T.textMuted, textAlign: 'center', padding: 40 }}>Sin sesiones</div>}
          </>
        )}
      </div>
    </div>
  );
}

const td = { padding: '11px 14px', color: '#334155' };
