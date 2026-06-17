import React, { useEffect, useState } from 'react';
import api from '../api';
import { T } from '../theme';

const empty = { razon_social:'', nit:'', ciudad:'', direccion:'', contacto:'', email:'', telefono:'' };

export default function AliadosPage() {
  const [aliados,  setAliados]  = useState([]);
  const [stations, setStations] = useState([]);
  const [form,     setForm]     = useState(empty);
  const [editing,  setEditing]  = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [tab,      setTab]      = useState('list');

  const load = () => {
    api.get('/aliados').then(setAliados).catch(()=>{});
    api.get('/stations').then(setStations).catch(()=>{});
  };
  useEffect(load, []);

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  async function handleSave(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      if (editing) await api.put(`/aliados/${editing}`, form);
      else         await api.post('/aliados', form);
      setForm(empty); setEditing(null); setTab('list'); load();
    } catch(err) { setError(err.error || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  function startEdit(a) {
    setForm({ razon_social:a.razon_social, nit:a.nit, ciudad:a.ciudad||'', direccion:a.direccion||'', contacto:a.contacto||'', email:a.email||'', telefono:a.telefono||'' });
    setEditing(a.id); setTab('form');
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Eliminar este aliado?')) return;
    await api.delete(`/aliados/${id}`); load();
  }

  // Station financial config
  const [stFinancial, setStFinancial] = useState({});
  const [savingSt, setSavingSt] = useState(null);

  useEffect(() => {
    const f = {};
    stations.forEach(s => { f[s.id] = { aliado_id: s.aliado_id||'', cost_per_kwh: s.cost_per_kwh||800, commission_pct: s.commission_pct||5 }; });
    setStFinancial(f);
  }, [stations]);

  async function handleSaveStation(stId) {
    setSavingSt(stId);
    try { await api.patch(`/aliados/station/${stId}`, stFinancial[stId]); load(); }
    catch(err) { alert(err.error||'Error'); }
    finally { setSavingSt(null); }
  }

  const cop = n => `$${Math.round(n||0).toLocaleString('es-CO')}`;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ color:T.text, fontSize:26, fontWeight:800, margin:0 }}>Aliados & Entidades</h1>
          <div style={{ color:T.textMuted, fontSize:13, marginTop:2 }}>Entidades legales y configuración financiera por estación</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {[['list','Aliados'],['stations','Estaciones'],['form', editing ? 'Editar aliado' : '+ Nuevo aliado']].map(([t,l])=>(
            <button key={t} onClick={()=>{ if(t!=='form'){setEditing(null);setForm(empty);} setTab(t); }} style={{
              background: tab===t ? T.primary : '#fff', color: tab===t ? '#fff' : T.textMuted,
              border:`1.5px solid ${tab===t ? T.primary : T.borderCard}`, borderRadius:10,
              padding:'9px 18px', fontWeight:700, cursor:'pointer', fontSize:13,
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Lista de aliados */}
      {tab==='list' && (
        <div style={{ display:'grid', gap:14 }}>
          {!aliados.length && <div style={{ color:T.textMuted, padding:20 }}>No hay aliados registrados. Crea el primero con "+ Nuevo aliado".</div>}
          {aliados.map(a => {
            const sts = stations.filter(s => s.aliado_id === a.id);
            return (
              <div key={a.id} style={{ background:'#fff', borderRadius:16, padding:24, boxShadow:'0 2px 12px rgba(0,0,0,0.06)', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:17, color:T.text }}>{a.razon_social}</div>
                  <div style={{ color:T.primary, fontWeight:600, fontSize:13 }}>NIT: {a.nit}</div>
                  <div style={{ color:T.textMuted, fontSize:13, marginTop:4 }}>{a.ciudad} {a.direccion ? `· ${a.direccion}` : ''}</div>
                  {a.contacto && <div style={{ color:T.textMuted, fontSize:12 }}>👤 {a.contacto}  {a.email ? `· ${a.email}` : ''}  {a.telefono ? `· ${a.telefono}` : ''}</div>}
                  <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}>
                    {sts.map(s => <span key={s.id} style={{ background:'#f0fdf4', color:T.primary, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700 }}>{s.name}</span>)}
                    {!sts.length && <span style={{ color:T.textMuted, fontSize:12 }}>Sin estaciones asignadas</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>startEdit(a)} style={{ background:'#f8fafc', color:T.text, border:`1px solid ${T.borderCard}`, borderRadius:8, padding:'7px 14px', cursor:'pointer', fontSize:13 }}>✏️ Editar</button>
                  <button onClick={()=>handleDelete(a.id)} style={{ background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:8, padding:'7px 14px', cursor:'pointer', fontSize:13 }}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Configuración financiera por estación */}
      {tab==='stations' && (
        <div style={{ display:'grid', gap:16 }}>
          {stations.map(st => {
            const sf = stFinancial[st.id] || {};
            const aliado = aliados.find(a => a.id === sf.aliado_id);
            return (
              <div key={st.id} style={{ background:'#fff', borderRadius:16, padding:24, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ fontWeight:800, fontSize:16, color:T.text, marginBottom:16 }}>{st.name} <span style={{ color:T.textMuted, fontWeight:400, fontSize:13 }}>— {st.city}</span></div>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12, alignItems:'end' }}>
                  <div>
                    <label style={lbl}>Aliado (entidad que factura la energía)</label>
                    <select value={sf.aliado_id||''} onChange={e=>setStFinancial(f=>({...f,[st.id]:{...f[st.id],aliado_id:e.target.value}}))} style={{...sel,width:'100%'}}>
                      <option value="">Sin aliado asignado</option>
                      {aliados.map(a=><option key={a.id} value={a.id}>{a.razon_social} — NIT {a.nit}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>💡 Costo energía (COP/kWh)</label>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ color:T.textMuted, fontSize:13 }}>$</span>
                      <input type="number" value={sf.cost_per_kwh||''} onChange={e=>setStFinancial(f=>({...f,[st.id]:{...f[st.id],cost_per_kwh:e.target.value}}))} style={{...inp,flex:1}} />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>% Comisión sobre ventas</label>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <input type="number" min="0" max="100" step="0.1" value={sf.commission_pct||''} onChange={e=>setStFinancial(f=>({...f,[st.id]:{...f[st.id],commission_pct:e.target.value}}))} style={{...inp,width:70}} />
                      <span style={{ color:T.textMuted, fontSize:13 }}>%</span>
                    </div>
                  </div>
                </div>
                {aliado && sf.cost_per_kwh && (
                  <div style={{ marginTop:12, background:'#f8fafc', borderRadius:10, padding:'10px 14px', fontSize:12, color:T.textMuted, display:'flex', gap:24 }}>
                    <span>💡 Precio costo: <strong style={{color:T.text}}>{cop(sf.cost_per_kwh)}/kWh</strong></span>
                    <span>💰 Precio venta: <strong style={{color:T.primary}}>{cop(st.price_per_kwh)}/kWh</strong></span>
                    <span>📊 Margen bruto: <strong style={{color:'#16a34a'}}>{cop((st.price_per_kwh||0)-(sf.cost_per_kwh||0))}/kWh</strong></span>
                    <span>🤝 Comisión aliado: <strong style={{color:'#b45309'}}>{sf.commission_pct}% de venta</strong></span>
                  </div>
                )}
                <button onClick={()=>handleSaveStation(st.id)} disabled={savingSt===st.id} style={{ marginTop:14, background:T.primary, color:'#fff', border:'none', borderRadius:10, padding:'9px 20px', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                  {savingSt===st.id ? 'Guardando...' : '💾 Guardar configuración'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Formulario nuevo/editar aliado */}
      {tab==='form' && (
        <div style={{ background:'#fff', borderRadius:16, padding:28, boxShadow:'0 2px 12px rgba(0,0,0,0.06)', maxWidth:700 }}>
          <h2 style={{ color:T.text, fontSize:16, fontWeight:700, marginBottom:20 }}>{editing ? 'Editar aliado' : 'Registrar nuevo aliado'}</h2>
          <form onSubmit={handleSave} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Razón social *</label>
              <input required placeholder="Centro Comercial Buenavista SAS" value={form.razon_social} onChange={set('razon_social')} style={{...inp,width:'100%'}} />
            </div>
            <div>
              <label style={lbl}>NIT *</label>
              <input required placeholder="900123456-1" value={form.nit} onChange={set('nit')} style={{...inp,width:'100%'}} />
            </div>
            <div>
              <label style={lbl}>Ciudad</label>
              <input placeholder="Barranquilla" value={form.ciudad} onChange={set('ciudad')} style={{...inp,width:'100%'}} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Dirección</label>
              <input placeholder="Cra 53 #98-99" value={form.direccion} onChange={set('direccion')} style={{...inp,width:'100%'}} />
            </div>
            <div>
              <label style={lbl}>Nombre contacto</label>
              <input placeholder="Juan García" value={form.contacto} onChange={set('contacto')} style={{...inp,width:'100%'}} />
            </div>
            <div>
              <label style={lbl}>Teléfono</label>
              <input placeholder="3001234567" value={form.telefono} onChange={set('telefono')} style={{...inp,width:'100%'}} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={lbl}>Email (para envío de reportes)</label>
              <input type="email" placeholder="facturacion@buenavista.com" value={form.email} onChange={set('email')} style={{...inp,width:'100%'}} />
            </div>
            {error && <div style={{ color:'#dc2626', fontSize:13, gridColumn:'1/-1' }}>{error}</div>}
            <div style={{ gridColumn:'1/-1', display:'flex', gap:10 }}>
              <button type="submit" disabled={saving} style={{ background:T.primary, color:'#fff', border:'none', borderRadius:10, padding:'13px 28px', fontWeight:700, fontSize:15, cursor:'pointer' }}>
                {saving ? 'Guardando...' : editing ? '💾 Guardar cambios' : '+ Registrar aliado'}
              </button>
              <button type="button" onClick={()=>{setTab('list');setEditing(null);setForm(empty);}} style={{ background:'#f1f5f9', color:T.textMuted, border:'none', borderRadius:10, padding:'13px 20px', fontWeight:600, cursor:'pointer' }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const inp = { background:'#f8fafc', color:'#0f172a', border:'1.5px solid #e2e8f0', borderRadius:10, padding:'11px 14px', fontSize:14, outline:'none' };
const sel = { background:'#f8fafc', color:'#0f172a', border:'1.5px solid #e2e8f0', borderRadius:10, padding:'11px 14px', fontSize:14, outline:'none', cursor:'pointer' };
const lbl = { color:'#64748b', fontSize:12, display:'block', marginBottom:5, fontWeight:600 };
