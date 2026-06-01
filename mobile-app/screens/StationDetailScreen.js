import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, RefreshControl } from 'react-native';
import { stations, chargers } from '../services/api';
import { useAuth } from '../services/AuthContext';

const STATUS_CONFIG = {
  Available:   { color: '#00e5b4', bg: '#00e5b41a', label: 'Disponible',    icon: '✅' },
  Occupied:    { color: '#f59e0b', bg: '#f59e0b1a', label: 'Ocupado',       icon: '🔌' },
  Faulted:     { color: '#ef4444', bg: '#ef44441a', label: 'Falla',         icon: '⚠️' },
  Unavailable: { color: '#6b7280', bg: '#6b72801a', label: 'Mantenimiento', icon: '🔧' },
  Charging:    { color: '#f59e0b', bg: '#f59e0b1a', label: 'Cargando',      icon: '⚡' },
};

function getStatus(c) {
  return STATUS_CONFIG[c.status] || STATUS_CONFIG.Unavailable;
}

export default function StationDetailScreen({ route, navigation }) {
  const { stationId: id } = route.params;
  const { user, refreshBalance } = useAuth();
  const [station,    setStation]    = useState(null);
  const [sessions,   setSessions]   = useState({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting,   setStarting]   = useState(null);
  const [stopping,   setStopping]   = useState(null);

  const load = useCallback(async () => {
    try {
      const st = await stations.getById(id);
      setStation(st);
      const sessionMap = {};
      await Promise.all(
        (st.chargers || []).map(async c => {
          const cpId = c.charge_point_id || c.chargePointId || c.id;
          try { sessionMap[cpId] = await chargers.activeSession(cpId); } catch {}
        })
      );
      setSessions(sessionMap);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleStart(cpId) {
    setStarting(cpId);
    try {
      await chargers.start(cpId, 1);
      await refreshBalance();
      await load();
      Alert.alert('✅ Carga iniciada', 'Tu sesión de carga ha comenzado.');
    } catch (err) {
      Alert.alert('Error', err.error || 'No se pudo iniciar la carga');
    } finally {
      setStarting(null);
    }
  }

  async function handleStop(cpId, transactionId) {
    setStopping(cpId);
    try {
      await chargers.stop(cpId, transactionId);
      await refreshBalance();
      await load();
      Alert.alert('✅ Carga finalizada', 'Tu sesión ha terminado. Revisa tu historial.');
    } catch (err) {
      Alert.alert('Error', err.error || 'No se pudo detener la carga');
    } finally {
      setStopping(null);
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#00e5b4" size="large" /></View>;
  if (!station) return <View style={s.center}><Text style={{ color: '#888' }}>Estación no encontrada</Text></View>;

  const available = (station.chargers || []).filter(c => c.status === 'Available').length;
  const total     = (station.chargers || []).length;

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#00e5b4" />}
    >
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
        <View style={[s.onlineDot, { backgroundColor: station.online ? '#00e5b4' : '#555' }]} />
      </View>

      {/* Info estación */}
      <View style={s.info}>
        <Text style={s.name}>{station.name}</Text>
        <Text style={s.cityTag}>📍 {station.city}</Text>
        <Text style={s.address}>{station.address}</Text>

        {/* Resumen disponibilidad */}
        <View style={s.availRow}>
          <View style={s.availBadge}>
            <Text style={s.availNum}>{available}</Text>
            <Text style={s.availLabel}>disponibles</Text>
          </View>
          <View style={[s.availBadge, { backgroundColor: '#f59e0b1a' }]}>
            <Text style={[s.availNum, { color: '#f59e0b' }]}>{total - available}</Text>
            <Text style={[s.availLabel, { color: '#f59e0b' }]}>ocupados</Text>
          </View>
          <View style={[s.availBadge, { backgroundColor: '#1a1d27' }]}>
            <Text style={[s.availNum, { color: '#888' }]}>{total}</Text>
            <Text style={[s.availLabel, { color: '#888' }]}>total</Text>
          </View>
        </View>

        <Text style={s.price}>💰 $1.200 COP/kWh · Saldo: <Text style={{ color: '#00e5b4', fontWeight: '700' }}>${(user?.balance || 0).toLocaleString('es-CO')}</Text></Text>
      </View>

      {/* Pistolas / cargadores */}
      <Text style={s.sectionTitle}>Pistolas de carga</Text>

      {(station.chargers || []).map(charger => {
        const cpId         = charger.charge_point_id || charger.chargePointId || charger.id;
        const powerKw      = charger.max_power_kw || charger.maxPowerKw || 0;
        const connType     = charger.connector_type || charger.connectorType || 'CCS2';
        const chType       = charger.charger_type   || charger.chargerType   || 'DC';
        const model        = charger.model || '';
        const st           = getStatus(charger);
        const activeSession = sessions[cpId];
        const mySession    = activeSession?.user_id === user?.id || activeSession?.userId === user?.id ? activeSession : null;
        const busy         = starting === cpId || stopping === cpId;

        return (
          <View key={cpId} style={[s.chargerCard, { borderLeftColor: st.color, borderLeftWidth: 4 }]}>
            {/* Cabecera pistola */}
            <View style={s.chargerTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.chargerName}>{cpId}</Text>
                {model ? <Text style={s.model}>{model}</Text> : null}
                <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                  <Text style={[s.statusText, { color: st.color }]}>{st.icon} {st.label}</Text>
                </View>
              </View>
              <View style={s.chargerPower}>
                <Text style={[s.powerText, { color: st.color }]}>{powerKw} kW</Text>
                <Text style={s.powerSub}>{chType}</Text>
                <Text style={s.connType}>{connType}</Text>
              </View>
            </View>

            {/* Sesión activa — propia o de otro usuario */}
            {activeSession && (
              <View style={s.activeSession}>
                {mySession
                  ? <Text style={s.sessionLabel}>⚡ Tu sesión activa</Text>
                  : <Text style={[s.sessionLabel, { color: '#f59e0b' }]}>🔌 En uso por otro cliente</Text>}
                {(() => {
                  const startedAt = activeSession.started_at || activeSession.startedAt;
                  if (!startedAt) return null;
                  const elapsed = Math.floor((Date.now() - new Date(startedAt)) / 60000);
                  const avgDur  = powerKw >= 50 ? 35 : 120;
                  const remaining = Math.max(0, avgDur - elapsed);
                  return (
                    <>
                      <Text style={s.sessionDetail}>⏱ Tiempo en carga: {elapsed} min</Text>
                      {remaining > 0
                        ? <Text style={[s.sessionDetail, { color: '#00e5b4' }]}>🏁 Termina en aprox. {remaining} min</Text>
                        : <Text style={[s.sessionDetail, { color: '#f59e0b' }]}>⏳ Finalizando pronto...</Text>}
                      {mySession && <Text style={s.sessionDetail}>kWh: {parseFloat(mySession.kwh_used || mySession.kwhUsed || 0).toFixed(2)} · Costo: ${Math.round(parseFloat(mySession.cost || 0)).toLocaleString('es-CO')} COP</Text>}
                    </>
                  );
                })()}
              </View>
            )}

            {/* Botón acción */}
            {mySession ? (
              <TouchableOpacity style={[s.btn, s.btnStop]} onPress={() => handleStop(cpId, mySession.transaction_id || mySession.transactionId)} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>⏹ Detener carga</Text>}
              </TouchableOpacity>
            ) : charger.status === 'Available' ? (
              <TouchableOpacity style={s.btn} onPress={() => handleStart(cpId)} disabled={busy}>
                {busy ? <ActivityIndicator color="#0f1117" /> : <Text style={[s.btnText, { color: '#0f1117' }]}>⚡ Iniciar carga</Text>}
              </TouchableOpacity>
            ) : charger.status === 'Unavailable' ? (
              <View style={s.statusBar}>
                <Text style={s.unavailText}>🔧 En mantenimiento — no disponible</Text>
              </View>
            ) : charger.status === 'Faulted' ? (
              <View style={s.statusBar}>
                <Text style={[s.unavailText, { color: '#ef4444' }]}>⚠️ Falla detectada — fuera de servicio</Text>
              </View>
            ) : (
              <View style={s.statusBar}>
                <Text style={s.unavailText}>🔌 Ocupado por otro usuario</Text>
              </View>
            )}
          </View>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0f1117' },
  center:       { flex: 1, backgroundColor: '#0f1117', justifyContent: 'center', alignItems: 'center' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56 },
  backBtn:      {},
  backText:     { color: '#00e5b4', fontSize: 16, fontWeight: '600' },
  onlineDot:    { width: 12, height: 12, borderRadius: 6 },
  info:         { padding: 20, paddingTop: 0 },
  name:         { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  cityTag:      { color: '#00e5b4', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  address:      { color: '#888', fontSize: 13, marginBottom: 14 },
  availRow:     { flexDirection: 'row', gap: 10, marginBottom: 14 },
  availBadge:   { flex: 1, backgroundColor: '#00e5b41a', borderRadius: 12, padding: 12, alignItems: 'center' },
  availNum:     { color: '#00e5b4', fontSize: 22, fontWeight: '800' },
  availLabel:   { color: '#00e5b4', fontSize: 11, marginTop: 2 },
  price:        { color: '#aaa', fontSize: 13 },
  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 },
  chargerCard:  { backgroundColor: '#1a1d27', borderRadius: 16, marginHorizontal: 16, marginBottom: 14, padding: 18 },
  chargerTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  chargerName:  { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  model:        { color: '#888', fontSize: 12, marginBottom: 6 },
  statusBadge:  { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:   { fontWeight: '700', fontSize: 12 },
  chargerPower: { alignItems: 'flex-end' },
  powerText:    { fontSize: 26, fontWeight: '800' },
  powerSub:     { color: '#888', fontSize: 12 },
  connType:     { color: '#555', fontSize: 11, marginTop: 2 },
  activeSession:{ backgroundColor: '#0f1117', borderRadius: 10, padding: 12, marginBottom: 12 },
  sessionLabel: { color: '#00e5b4', fontWeight: '700', marginBottom: 4 },
  sessionDetail:{ color: '#888', fontSize: 12, marginBottom: 2 },
  btn:          { backgroundColor: '#00e5b4', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnStop:      { backgroundColor: '#ef4444' },
  btnText:      { fontWeight: '700', fontSize: 15, color: '#fff' },
  statusBar:    { backgroundColor: '#0f1117', borderRadius: 10, padding: 12, alignItems: 'center' },
  unavailText:  { color: '#6b7280', fontSize: 13, fontWeight: '600' },
});
