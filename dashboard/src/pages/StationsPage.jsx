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

  const load = () => api.get('/stations').then(setData).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

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

  const statusColor = s => ({ Available: T.primary, Occupied: T.warning, Unavailable: T.textMuted, Faulted: T.danger }[s] || T.textMuted);

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
            <button type="submit" disabled={savingSt} style={{ ...btn, gridColumn:'1/-1' }}>{savingSt ? 'Guardando...' : '+ Crear estación'}</button>
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
            <button type="submit" disabled={savingCh} style={{ ...btn, gridColumn:'1/-1' }}>{savingCh ? 'Guardando...' : '+ Agregar cargador'}</button>
          </form>
        </div>
      )}

      {/* Lista */}
      {tab === 'list' && (
        loading ? <div style={{ color: T.textMuted }}>Cargando...</div> : (
          <div style={{ display: 'grid', gap: 14 }}>
            {data.map(st => (
              <div key={st.id} style={{ background: '#fff', borderRadius: 16, padding: 22, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ color: T.text, fontWeight: 700, fontSize: 17 }}>{st.name}</div>
                    <div style={{ color: T.primary, fontSize: 12, fontWeight: 600 }}>{st.city}</div>
                    <div style={{ color: T.textMuted, fontSize: 13 }}>{st.address}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: st.online ? T.success : '#cbd5e1' }} />
                    <span style={{ color: T.textMuted, fontSize: 12 }}>{st.online ? 'En línea' : 'Sin conexión'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(st.chargers || []).map((c, i) => (
                    <div key={i} style={{ border: `1.5px solid ${statusColor(c.status)}22`, borderRadius: 10, padding: '8px 14px', background: '#f8fafc' }}>
                      <div style={{ color: T.text, fontWeight: 700, fontSize: 13 }}>{c.chargePointId || c.id}</div>
                      <div style={{ color: T.textMuted, fontSize: 11 }}>{c.model || `${c.maxPowerKw}kW`} · {c.connectorType || 'CCS2'}</div>
                      <div style={{ color: statusColor(c.status), fontSize: 11, fontWeight: 600 }}>{c.status}</div>
                    </div>
                  ))}
                  {!(st.chargers || []).length && <div style={{ color: T.textMuted, fontSize: 13 }}>Sin cargadores registrados</div>}
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

const inp = { background: '#f8fafc', color: T.text, border: `1.5px solid ${T.borderCard}`, borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none' };
const btn = { background: T.primary, color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', borderRadius: 10, padding: '14px', cursor: 'pointer' };
const sel = { background: '#f8fafc', color: T.text, border: `1.5px solid ${T.borderCard}`, borderRadius: 10, padding: '12px 14px', fontSize: 14, outline: 'none', cursor: 'pointer' };
const lbl = { color: T.textMuted, fontSize: 12, display: 'block', marginBottom: 6 };
