import React, { useEffect, useState } from 'react';
import api from '../api';
import { T } from '../theme';

const LEVELS = [
  { level: 'Platino', emoji: '💎', color: '#7c3aed', bg: '#f5f3ff', min: 500, max: null },
  { level: 'Oro',     emoji: '🥇', color: '#b45309', bg: '#fffbeb', min: 200, max: 499 },
  { level: 'Plata',   emoji: '🥈', color: '#475569', bg: '#f8fafc', min: 50,  max: 199 },
  { level: 'Bronce',  emoji: '🥉', color: '#c2410c', bg: '#fff7ed', min: 0,   max: 49  },
];

function getLevel(kwh = 0) {
  return LEVELS.find(l => kwh >= l.min && (l.max === null || kwh <= l.max)) || LEVELS[3];
}

const cop = n => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const fmt = iso => iso ? new Date(iso).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'2-digit' }) : '—';

export default function ClientesPage() {
  const [data,        setData]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [filter,      setFilter]      = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [selected,    setSelected]    = useState(null);

  useEffect(() => {
    api.get('/users/stats')
      .then(setData)
      .catch(e => setError(e.error || 'Error cargando clientes'))
      .finally(() => setLoading(false));
  }, []);

  const byLevel = LEVELS.map(l => ({ ...l, count: data.filter(u => u.level === l.level).length }));

  const filtered = data.filter(u => {
    const t = filter.toLowerCase();
    return (!filter || u.name?.toLowerCase().includes(t) || u.email?.toLowerCase().includes(t))
      && (!levelFilter || u.level === levelFilter);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: T.text, fontSize: 26, fontWeight: 800, margin: 0 }}>Clientes & Niveles</h1>
          <div style={{ color: T.textMuted, fontSize: 13, marginTop: 2 }}>{data.length} clientes registrados</div>
        </div>
      </div>

      {/* Tarjetas de nivel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {byLevel.map(l => (
          <div key={l.level} onClick={() => setLevelFilter(levelFilter === l.level ? '' : l.level)} style={{
            background: levelFilter === l.level ? l.bg : '#fff',
            border: `2px solid ${levelFilter === l.level ? l.color : T.borderCard}`,
            borderRadius: 14, padding: 18, cursor: 'pointer', transition: 'all .15s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{l.emoji}</div>
            <div style={{ color: l.color, fontWeight: 800, fontSize: 22 }}>{l.count}</div>
            <div style={{ color: T.text, fontWeight: 700 }}>{l.level}</div>
            <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>
              {l.max ? `${l.min}–${l.max} kWh` : `≥ ${l.min} kWh`}
            </div>
          </div>
        ))}
      </div>

      {/* Búsqueda */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <input
          placeholder="🔍  Buscar por nombre o email..."
          value={filter} onChange={e => setFilter(e.target.value)}
          style={{ flex: 1, background: '#fff', color: T.text, border: `1.5px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, outline: 'none' }}
        />
        {(filter || levelFilter) && (
          <button onClick={() => { setFilter(''); setLevelFilter(''); }} style={{ background: '#f1f5f9', color: T.textMuted, border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>
            Limpiar
          </button>
        )}
      </div>

      {loading && <div style={{ color: T.textMuted, textAlign: 'center', padding: 40 }}>⏳ Calculando estadísticas de clientes...</div>}
      {error   && <div style={{ color: T.danger, padding: 16 }}>{error}</div>}

      {!loading && !error && (
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Nivel','Cliente','Ciudad','Sesiones','kWh total','Ingresos','Último uso','Saldo'].map(h => (
                  <th key={h} style={{ padding: '13px 16px', color: T.textMuted, fontWeight: 600, textAlign: 'left', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const lvl  = getLevel(u.kwhTotal);
                const prog = lvl.max ? Math.min(100, ((u.kwhTotal - lvl.min) / (lvl.max - lvl.min + 1)) * 100) : 100;
                const isSelected = selected?.id === u.id;
                return (
                  <React.Fragment key={u.id}>
                    <tr onClick={() => setSelected(isSelected ? null : u)} style={{
                      borderTop: `1px solid ${T.borderCard}`, cursor: 'pointer',
                      background: isSelected ? '#f0fdf4' : 'transparent',
                      transition: 'background .1s',
                    }}>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ background: lvl.bg, color: lvl.color, borderRadius: 8, padding: '4px 10px', fontWeight: 700, fontSize: 12, border: `1px solid ${lvl.color}44` }}>
                          {lvl.emoji} {lvl.level}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ color: T.text, fontWeight: 600 }}>{u.name}</div>
                        <div style={{ color: T.textMuted, fontSize: 11 }}>{u.email}</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: T.textMuted }}>{u.city || '—'}</td>
                      <td style={{ padding: '12px 16px', color: T.text, fontWeight: 600 }}>{u.sessions}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ color: T.blue, fontWeight: 700 }}>{u.kwhTotal?.toFixed(1)} kWh</div>
                        <div style={{ marginTop: 4, height: 4, background: '#e2e8f0', borderRadius: 2, width: 70 }}>
                          <div style={{ height: '100%', width: `${prog}%`, background: lvl.color, borderRadius: 2 }} />
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: T.textMuted }}>{cop(u.revenueTotal)}</td>
                      <td style={{ padding: '12px 16px', color: T.textMuted, fontSize: 12 }}>{fmt(u.lastSession)}</td>
                      <td style={{ padding: '12px 16px', color: T.primary, fontWeight: 600 }}>{cop(u.balance)}</td>
                    </tr>

                    {/* Detalle expandido */}
                    {isSelected && (
                      <tr>
                        <td colSpan={8} style={{ background: '#f0fdf4', padding: '16px 24px', borderTop: `1px solid ${T.border}` }}>
                          <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* Trayectoria */}
                            <div>
                              <div style={{ color: T.textMuted, fontSize: 12, marginBottom: 8 }}>Trayectoria de nivel</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {[...LEVELS].reverse().map((l, i) => {
                                  const reached = u.kwhTotal >= l.min;
                                  return (
                                    <React.Fragment key={l.level}>
                                      <div style={{ textAlign: 'center', opacity: reached ? 1 : 0.3 }}>
                                        <div style={{ fontSize: 22 }}>{l.emoji}</div>
                                        <div style={{ color: reached ? l.color : T.textMuted, fontSize: 10, fontWeight: 700 }}>{l.level}</div>
                                      </div>
                                      {i < 3 && <div style={{ color: '#cbd5e1', fontSize: 14 }}>→</div>}
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            </div>
                            {/* Próximo nivel */}
                            <div>
                              <div style={{ color: T.textMuted, fontSize: 12, marginBottom: 4 }}>Próximo nivel</div>
                              {lvl.max === null
                                ? <div style={{ color: '#7c3aed', fontWeight: 700 }}>💎 Nivel máximo — ¡Cliente VIP!</div>
                                : <div style={{ color: T.text }}>Faltan <strong style={{ color: T.primary }}>{(lvl.max + 1 - u.kwhTotal).toFixed(1)} kWh</strong> para {LEVELS[LEVELS.findIndex(l=>l.level===lvl.level)-1]?.emoji} {LEVELS[LEVELS.findIndex(l=>l.level===lvl.level)-1]?.level}</div>
                              }
                            </div>
                            {/* idTag */}
                            <div>
                              <div style={{ color: T.textMuted, fontSize: 12, marginBottom: 4 }}>idTag OCPP</div>
                              <div style={{ color: T.primary, fontFamily: 'monospace', fontWeight: 700 }}>{u.idTag}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && <div style={{ color: T.textMuted, textAlign: 'center', padding: 40 }}>Sin clientes que coincidan con el filtro</div>}
        </div>
      )}
    </div>
  );
}
