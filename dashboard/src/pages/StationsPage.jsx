import React, { useEffect, useState } from 'react';
import api from '../api';
import { T } from '../theme';

const EQUIPMENT_CATALOG = [
  { model: 'HT-EA-007-C-D', label: 'AC 7kW  — HT-EA-007-C-D',  powerKw: 7,   connectors: 1, connectorType: 'Type 2', type: 'AC' },
  { model: 'HT-EA-022-C-D', label: 'AC 22kW — HT-EA-022-C-D',  powerKw: 22,  connectors: 1, connectorType: 'Type 2', type: 'AC' },
  { model: 'HT-ED-030-C',   label: 'DC 30kW — HT-ED-030-C',    powerKw: 30,  connectors: 1, connectorType: 'CCS2',   type: 'DC' },
  { model: 'HT-ED-060-C',   label: 'DC 60kW — HT-ED-060-C',    powerKw: 60,  connectors: 2, connectorType: 'CCS2',   type: 'DC' },
  { model: 'HT-ED-120-C',   label: 'DC 120kW — HT-ED-120-C',   powerKw: 120, connectors: 2, connectorType: 'CCS2',   type: 'DC' },
  { model: 'HT-ED-240-C',   label: 'DC 240kW — HT-ED-240-C',   powerKw: 240, connectors: 2, connectorType: 'CCS2',   type: 'DC' },
];

const STATUS_CFG = {
  Available:   { label: 'Disponible',     color: '#16a34a', bg: '#f0fdf4' },
  Charging:    { label: 'Cargando',       color: '#d97706', bg: '#fffbeb' },
  Occupied:    { label: 'Ocupado',        color: '#d97706', bg: '#fffbeb' },
  Faulted:     { label: 'Falla',          color: '#dc2626', bg: '#fef2f2' },
  Unavailable: { label: 'No disponible',  color: '#6b7280', bg: '#f9fafb' },
};

const cop = n => `$${Math.round(n || 0).toLocaleString('es-CO')}`;

const emptyStation = { name: '', city: '', address: '', lat: '', lng: '', description: '' };
const emptyCharger = { stationId: '', chargePointId: '', model: '' };

export default function StationsPage() {
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('list');
  const [stForm,   setStForm]   = useState(emptyStation);
  const [chForm,   setChForm]   = useState(emptyCharger);
  const [savingSt, setSavingSt] = useState(false);
  const [savingCh, setSavingCh] = useState(false);
  const [stError,  setStError]  = useState('');
  const [chError,  setChError]  = useState('');
  const [prices,   setPrices]   = useState({}); // stationId → precio editado
  const [savingPrice, setSavingPrice] = useState(null);
  const [resetting,   setResetting]   = useState(null);

  const load = () => {
    api.get('/stations').then(d => {
      setData(d);
      const p = {};
      d.forEach(s => { p[s.id] = s.price_per_kwh ?? 1800; });
      setPrices(p);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const setSt = k => e => setStForm(p => ({ ...p, [k]: e.target.value }));
  const setCh = k => e => setChForm(p => ({ ...p, [k]: e.target.value }));
  const selectedEq = EQUIPMENT_CATALOG.find(e => e.model === chForm.model);

  async function handleCreateStation(e) {
    e.preventDefault(); setSavingSt(true); setStError('');
    try {
      await api.post('/stations', { ...stForm, lat: parseFloat(stForm.lat), lng: parseFloat(stForm.lng) });
      setStForm(emptyStation); setTab('list'); load();
    } catch (err) { setStError(err.error || 'Error al crear'); }
    finally { setSavingSt(false); }
  }

  async function handleCreateCharger(e) {
    e.preventDefault(); setSavingCh(true); setChError('');
    try {
      const eq = selectedEq;
      await api.post('/chargers', { stationId: chForm.stationId, chargePointId: chForm.chargePointId, model: eq.model, connectors: eq.connectors, connectorType: eq.connectorType, chargerType: eq.type, maxPowerKw: eq.powerKw });
      setChForm(emptyCharger); setTab('list'); load();
    } catch (err) { setChError(err.error || 'Error al crear'); }
    finally { setSavingCh(false); }
  }

  async function handleSavePrice(stationId) {
    setSavingPrice(stationId);
    try {
      await api.patch(`/stations/${stationId}/price`, { price: prices[stationId] });
      load();
    } catch (err) { alert(err.error || 'Error al guardar precio'); }
    finally { setSavingPrice(null); }
  }

  async function handleReset(chargerId) {
    if (!window.confirm(`¿Reiniciar el cargador ${chargerId}?`)) return;
    setResetting(chargerId);
    try {
      await api.post(`/chargers/${chargerId}/reset`);
      load();
    } catch (err) { alert(err.error || 'Error al reiniciar'); }
    finally { setResetting(null); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: T.text, fontSize: 26, fontWeight: 800, margin: 0 }}>Estaciones & Cargadores</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['list','Ver estaciones'],['station','+ Estación'],['charger','+ Cargador']].map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? T.primary : '#fff', color: tab === t ? '#fff' : T.textMuted,
              border: `1.5px solid ${tab === t ? T.primary : T.borderCard}`, borderRadius: 10,
              padding: '9px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13,
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Nueva estación */}
      {tab === 'station' && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ color: T.text, fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nueva estación</h2>
          <form onSubmit={handleCreateStation} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['name','Nombre'],['city','Ciudad'],['address','Dirección'],['lat','Latitud'],['lng','Longitud']].map(([k, ph]) => (
              <input key={k} placeholder={ph} required value={stForm[k]} onChange={setSt(k)} style={inp} />
            ))}
            <input placeholder="Descripción (opcional)" value={stForm.description} onChange={setSt('description')} style={{ ...inp, gridColumn:'1/-1' }} />
            {stError && <div style={{ color: T.danger, fontSize: 13, gridColumn:'1/-1' }}>{stError}</div>}
            <button type="submit" disabled={savingSt} style={{ ...btnPrimary, gridColumn:'1/-1' }}>{savingSt ? 'Guardando...' : '+ Crear estación'}</button>
          </form>
        </div>
      )}

      {/* Nuevo cargador */}
      {tab === 'charger' && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <h2 style={{ color: T.text, fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Nuevo cargador</h2>
          <form onSubmit={handleCreateCharger} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Estación</label>
              <select required value={chForm.stationId} onChange={setCh('stationId')} style={{ ...sel, width:'100%' }}>
                <option value="">Selecciona estación</option>
                {data.map(s => <option key={s.id} value={s.id}>{s.name} — {s.city}</option>)}
              </select>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Modelo de equipo</label>
              <select required value={chForm.model} onChange={setCh('model')} style={{ ...sel, width:'100%' }}>
                <option value="">Selecciona el equipo</option>
                {EQUIPMENT_CATALOG.map(eq => <option key={eq.model} value={eq.model}>{eq.label}</option>)}
              </select>
            </div>
            {selectedEq && (
              <div style={{ gridColumn:'1/-1', background:'#f0fdf4', borderRadius:12, padding:14, display:'flex', gap:24 }}>
                <Detail label="Tipo"       value={selectedEq.type} />
                <Detail label="Potencia"   value={`${selectedEq.powerKw} kW`} />
                <Detail label="Conectores" value={`${selectedEq.connectors}× ${selectedEq.connectorType}`} />
              </div>
            )}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>ChargePoint ID (único)</label>
              <input placeholder="Ej: CP-BOG-001" required value={chForm.chargePointId} onChange={setCh('chargePointId')} style={{ ...inp, width:'100%' }} />
            </div>
            {chError && <div style={{ color: T.danger, fontSize: 13, gridColumn:'1/-1' }}>{chError}</div>}
            <button type="submit" disabled={savingCh} style={{ ...btnPrimary, gridColumn:'1/-1' }}>{savingCh ? 'Guardando...' : '+ Agregar cargador'}</button>
          </form>
        </div>
      )}

      {/* Lista */}
      {tab === 'list' && (
        loading ? <div style={{ color: T.textMuted }}>Cargando...</div> : (
          <div style={{ display: 'grid', gap: 16 }}>
            {data.map(st => (
              <div key={st.id} style={{ background: '#fff', borderRadius: 18, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

                {/* Header estación */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ color: T.text, fontWeight: 800, fontSize: 18 }}>{st.name}</div>
                    <div style={{ color: T.primary, fontSize: 12, fontWeight: 600, marginTop: 2 }}>{st.city}</div>
                    <div style={{ color: T.textMuted, fontSize: 13 }}>{st.address}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: st.online ? '#f0fdf4' : '#f1f5f9', borderRadius: 20, padding: '5px 12px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: st.online ? '#16a34a' : '#cbd5e1' }} />
                    <span style={{ color: st.online ? '#16a34a' : T.textMuted, fontSize: 12, fontWeight: 600 }}>{st.online ? 'En línea' : 'Sin conexión'}</span>
                  </div>
                </div>

                {/* Precio por kWh */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', borderRadius: 12, padding: '12px 16px', marginBottom: 16, border: '1.5px solid #e2e8f0' }}>
                  <span style={{ color: T.textMuted, fontSize: 13, fontWeight: 600 }}>💰 Precio por kWh:</span>
                  <span style={{ color: T.textMuted, fontSize: 13, fontWeight: 600 }}>$</span>
                  <input
                    type="number"
                    value={prices[st.id] ?? ''}
                    onChange={e => setPrices(p => ({ ...p, [st.id]: e.target.value }))}
                    style={{ width: 100, background: '#fff', color: T.text, border: `1.5px solid ${T.borderCard}`, borderRadius: 8, padding: '6px 10px', fontSize: 15, fontWeight: 700, outline: 'none' }}
                  />
                  <span style={{ color: T.textMuted, fontSize: 13 }}>COP</span>
                  <button
                    onClick={() => handleSavePrice(st.id)}
                    disabled={savingPrice === st.id}
                    style={{ background: T.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  >{savingPrice === st.id ? 'Guardando...' : 'Guardar precio'}</button>
                  <span style={{ color: T.textMuted, fontSize: 12, marginLeft: 4 }}>Actual: {cop(st.price_per_kwh)} / kWh</span>
                </div>

                {/* Cargadores */}
                <div style={{ display: 'grid', gap: 10 }}>
                  {(st.chargers || []).map(c => {
                    const cpId = c.chargePointId || c.charge_point_id || c.id;
                    const cfg  = STATUS_CFG[c.status] || STATUS_CFG.Unavailable;
                    return (
                      <div key={cpId} style={{ display: 'flex', alignItems: 'center', gap: 14, background: cfg.bg, borderRadius: 12, padding: '12px 16px', border: `1.5px solid ${cfg.color}33` }}>
                        {/* Estado */}
                        <div style={{ width: 10, height: 10, borderRadius: 5, background: cfg.color, flexShrink: 0 }} />

                        {/* Info */}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: T.text, fontWeight: 800, fontSize: 14 }}>{cpId}</span>
                            <span style={{ background: cfg.color, color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>{cfg.label}</span>
                            {c.online !== undefined && (
                              <span style={{ color: c.online ? '#16a34a' : '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                                {c.online ? '● OCPP conectado' : '○ OCPP desconectado'}
                              </span>
                            )}
                          </div>
                          <div style={{ color: T.textMuted, fontSize: 12, marginTop: 2 }}>
                            {c.model || '—'} · {c.maxPowerKw || c.max_power_kw || '?'} kW · {c.connectorType || c.connector_type || 'CCS2'}
                          </div>
                        </div>

                        {/* Botón reset */}
                        <button
                          onClick={() => handleReset(cpId)}
                          disabled={resetting === cpId}
                          title="Reiniciar cargador"
                          style={{ background: resetting === cpId ? '#f1f5f9' : '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >{resetting === cpId ? 'Reiniciando...' : '🔄 Reiniciar'}</button>
                      </div>
                    );
                  })}
                  {!(st.chargers || []).length && (
                    <div style={{ color: T.textMuted, fontSize: 13, padding: 8 }}>Sin cargadores registrados</div>
                  )}
                </div>

              </div>
            ))}
            {!data.length && <div style={{ color: T.textMuted }}>No hay estaciones.</div>}
          </div>
        )
      )}
    </div>
  );
}

function Detail({ label, value }) {
  return <div><div style={{ color: T.textMuted, fontSize: 11 }}>{label}</div><div style={{ color: T.primary, fontWeight: 700, fontSize: 14 }}>{value}</div></div>;
}

const inp       = { background: '#f8fafc', color: '#0f172a', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none' };
const btnPrimary = { background: T.primary, color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', borderRadius: 10, padding: '14px', cursor: 'pointer' };
const sel       = { background: '#f8fafc', color: '#0f172a', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', cursor: 'pointer' };
const lbl       = { color: T.textMuted, fontSize: 12, display: 'block', marginBottom: 6 };
