import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, ScrollView, RefreshControl, Linking,
} from 'react-native';
import { stations, chargers } from '../services/api';
import { useAuth } from '../services/AuthContext';

const STATUS_CONFIG = {
  Available:   { color: '#2563eb', bg: '#eff6ff', label: 'Disponible',    dot: '#2563eb' },
  Occupied:    { color: '#d97706', bg: '#fffbeb', label: 'Ocupado',       dot: '#d97706' },
  Charging:    { color: '#d97706', bg: '#fffbeb', label: 'Cargando',      dot: '#d97706' },
  Faulted:     { color: '#dc2626', bg: '#fef2f2', label: 'Falla',         dot: '#dc2626' },
  Unavailable: { color: '#6b7280', bg: '#f9fafb', label: 'No disponible', dot: '#6b7280' },
};

// Iconos de conector como componentes nativos
function ConnectorIcon({ type, size = 44, color = '#2563eb' }) {
  const s = size;
  const c = color;
  if (type === 'CCS1') {
    return (
      <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: s, height: s, borderRadius: s / 2, borderWidth: 2.5, borderColor: c, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: s * 0.55, gap: 3, justifyContent: 'center' }}>
            {[0,1,2,3,4].map(i => <View key={i} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c }} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
          </View>
        </View>
        <Text style={{ color: c, fontSize: 10, fontWeight: '800', marginTop: 3 }}>CCS1</Text>
      </View>
    );
  }
  if (type === 'CCS2') {
    return (
      <View style={{ width: s, height: s + 14, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: s, height: s, borderRadius: s / 2, borderWidth: 2.5, borderColor: c, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 2 }}>
            {[0,1,2].map(i => <View key={i} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c }} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {[0,1,2].map(i => <View key={i} style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c }} />)}
          </View>
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c, marginTop: 2 }} />
        </View>
        <Text style={{ color: c, fontSize: 10, fontWeight: '800', marginTop: 3 }}>CCS2</Text>
      </View>
    );
  }
  return (
    <View style={{ width: s, height: s + 14, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: s, height: s, borderRadius: s / 2, borderWidth: 2.5, borderColor: c, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: s * 0.5, height: s * 0.5, borderRadius: s * 0.25, borderWidth: 2, borderColor: c }} />
      </View>
      <Text style={{ color: c, fontSize: 10, fontWeight: '800', marginTop: 3 }}>{type}</Text>
    </View>
  );
}

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

const PARKING_FEE_PER_MIN = 100;
const PARKING_GRACE_MIN   = 15;

export default function StationDetailScreen({ route, navigation }) {
  const { stationId: id } = route.params;
  const { user, refreshBalance } = useAuth();
  const [station,    setStation]    = useState(null);
  const [sessionMap, setSessionMap] = useState({});
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting,   setStarting]   = useState(null);
  const [stopping,   setStopping]   = useState(null);
  const [selected,   setSelected]   = useState(null); // cpId seleccionado
  const now = useNow();

  const load = useCallback(async () => {
    try {
      const st = await stations.getById(id);
      setStation(st);
      const map = {};
      await Promise.all(
        (st.chargers || []).map(async c => {
          const cpId = c.charge_point_id || c.chargePointId || c.id;
          try { map[cpId] = await chargers.activeSession(cpId); } catch {}
        })
      );
      setSessionMap(map);
      // Auto-seleccionar primer disponible si no hay selección
      if (!selected) {
        const first = (st.chargers || []).find(c => c.status === 'Available');
        if (first) setSelected(first.charge_point_id || first.chargePointId || first.id);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (Object.keys(sessionMap).length === 0) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [sessionMap, load]);

  async function handleStart(cpId) {
    Alert.alert(
      '⚡ Iniciar carga',
      `Al terminar la carga tienes ${PARKING_GRACE_MIN} min para desconectar y retirar tu vehículo.\n\nSi permaneces estacionado después de ese tiempo se cobrará $${PARKING_FEE_PER_MIN.toLocaleString('es-CO')} COP por cada minuto adicional.\n\n¿Deseas continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, iniciar',
          onPress: async () => {
            setStarting(cpId);
            try {
              await chargers.start(cpId, 1);
              await refreshBalance();
              await load();
              Alert.alert('✅ Carga iniciada', 'Tu sesión ha comenzado. Te notificaremos al finalizar.');
            } catch (err) {
              Alert.alert('Error', err.error || 'No se pudo iniciar la carga');
            } finally {
              setStarting(null);
            }
          },
        },
      ]
    );
  }

  async function handleStop(cpId, transactionId) {
    setStopping(cpId);
    try {
      await chargers.stop(cpId, transactionId);
      await refreshBalance();
      await load();
      Alert.alert(
        '✅ Carga finalizada',
        `Tienes ${PARKING_GRACE_MIN} minutos para retirar tu vehículo antes de que apliquen cargos de parqueo ($${PARKING_FEE_PER_MIN}/min).`
      );
    } catch (err) {
      Alert.alert('Error', err.error || 'No se pudo detener la carga');
    } finally {
      setStopping(null);
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator color="#2563eb" size="large" /></View>;
  if (!station) return <View style={s.center}><Text style={{ color: '#888' }}>Estación no encontrada</Text></View>;

  const available = (station.chargers || []).filter(c => c.status === 'Available').length;
  const total     = (station.chargers || []).length;

  const selectedCharger = (station.chargers || []).find(c =>
    (c.charge_point_id || c.chargePointId || c.id) === selected
  );

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#2563eb" />}
    >
      {/* Banner */}
      <View style={s.banner}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backWrap}>
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <View style={s.bannerLogo}>
          <Text style={s.bannerBolt}>⚡</Text>
        </View>
        <View>
          <Text style={s.bannerTitle}>LUMINA</Text>
          <Text style={s.bannerSub}>ELECTROLINERAS</Text>
        </View>
        <View style={s.onlinePill}>
          <View style={[s.dot, { backgroundColor: station.online ? '#16a34a' : '#9ca3af' }]} />
          <Text style={{ color: station.online ? '#16a34a' : '#9ca3af', fontSize: 12, fontWeight: '600' }}>
            {station.online ? 'En línea' : 'Sin conexión'}
          </Text>
        </View>
      </View>

      {/* Info estación */}
      <View style={s.stationCard}>
        <View style={s.stationIconWrap}>
          <Text style={s.stationIcon}>⚡</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.stationName}>{station.name}</Text>
          <Text style={s.stationAddress}>{station.address}</Text>
          <TouchableOpacity
            style={s.wazeBtn}
            onPress={() => {
              const lat = station.lat;
              const lng = station.lng;
              const wazeUrl  = `waze://?ll=${lat},${lng}&navigate=yes`;
              const mapsUrl  = `https://maps.google.com/?q=${lat},${lng}`;
              Linking.canOpenURL(wazeUrl)
                .then(can => Linking.openURL(can ? wazeUrl : mapsUrl))
                .catch(() => Linking.openURL(mapsUrl));
            }}
          >
            <Text style={s.wazeIcon}>🚗</Text>
            <Text style={s.wazeBtnText}>Cómo llegar en Waze</Text>
          </TouchableOpacity>
        </View>
        <View style={s.distBadge}>
          <Text style={s.distText}>{available}/{total}</Text>
          <Text style={s.distLabel}>disp.</Text>
        </View>
      </View>

      {/* Selector de conector */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Selecciona tu tipo de conector</Text>
        </View>

        {(station.chargers || []).map(charger => {
          const cpId       = charger.charge_point_id || charger.chargePointId || charger.id;
          const connType   = charger.connector_type || charger.connectorType || 'CCS2';
          const powerKw    = charger.max_power_kw || charger.maxPowerKw || 0;
          const stCfg      = STATUS_CONFIG[charger.status] || STATUS_CONFIG.Unavailable;
          const isSelected = selected === cpId;
          const activeSession = sessionMap[cpId];
          const mySession  = activeSession?.user_id === user?.id ? activeSession : null;

          // Live timer
          let elapsedMin = 0, elapsedSec = 0, remainingMin = 0;
          if (activeSession?.started_at) {
            const ms = now - new Date(activeSession.started_at).getTime();
            elapsedMin = Math.floor(ms / 60000);
            elapsedSec = Math.floor((ms % 60000) / 1000);
            const avgDur = powerKw >= 50 ? 35 : 120;
            remainingMin = Math.max(0, avgDur - elapsedMin);
          }

          return (
            <TouchableOpacity
              key={cpId}
              style={[s.connectorCard, isSelected && s.connectorCardSelected, charger.status !== 'Available' && s.connectorCardDisabled]}
              onPress={() => setSelected(cpId)}
              activeOpacity={0.85}
            >
              <ConnectorIcon
                type={connType}
                size={44}
                color={charger.status === 'Available' ? '#2563eb' : stCfg.color}
              />

              <View style={s.connectorInfo}>
                <Text style={[s.connectorStatus, { color: stCfg.color }]}>{stCfg.label}</Text>
                <Text style={s.connectorPrice}>${(1200).toLocaleString('es-CO')} / 1 kWh</Text>
                <Text style={s.connectorPower}>Potencia máxima <Text style={{ fontWeight: '800', color: '#1d4ed8' }}>{powerKw} kW</Text></Text>

                {/* Timer activo */}
                {activeSession && (
                  <View style={s.timerInline}>
                    <Text style={{ color: charger.status === 'Available' ? '#2563eb' : '#d97706', fontSize: 12, fontWeight: '700' }}>
                      ⏱ {String(elapsedMin).padStart(2,'0')}:{String(elapsedSec).padStart(2,'0')} transcurrido
                      {remainingMin > 0 ? `  ·  ~${formatDuration(remainingMin)} restante` : '  ·  Finalizando...'}
                    </Text>
                  </View>
                )}
              </View>

              <View style={[s.radioOuter, isSelected && s.radioOuterSelected]}>
                {isSelected && <View style={s.radioInner} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Botones de acción del conector seleccionado */}
      {selectedCharger && (() => {
        const cpId = selectedCharger.charge_point_id || selectedCharger.chargePointId || selectedCharger.id;
        const activeSession = sessionMap[cpId];
        const mySession = activeSession?.user_id === user?.id ? activeSession : null;
        const busy = starting === cpId || stopping === cpId;

        return (
          <View style={s.actionArea}>
            {mySession ? (
              <>
                <View style={s.mySessionCard}>
                  <Text style={s.mySessionTitle}>⚡ Tu sesión activa</Text>
                  {(() => {
                    const ms = now - new Date(mySession.started_at).getTime();
                    const min = Math.floor(ms / 60000);
                    const sec = Math.floor((ms % 60000) / 1000);
                    const powerKw = selectedCharger.max_power_kw || selectedCharger.maxPowerKw || 0;
                    const avgDur = powerKw >= 50 ? 35 : 120;
                    const remaining = Math.max(0, avgDur - min);
                    return (
                      <View style={s.timerBig}>
                        <View style={s.timerBox}>
                          <Text style={s.timerNum}>{String(min).padStart(2,'0')}:{String(sec).padStart(2,'0')}</Text>
                          <Text style={s.timerLabel}>transcurrido</Text>
                        </View>
                        <View style={[s.timerBox, { backgroundColor: remaining > 0 ? '#eff6ff' : '#fffbeb' }]}>
                          <Text style={[s.timerNum, { color: remaining > 0 ? '#2563eb' : '#d97706' }]}>
                            {remaining > 0 ? `~${formatDuration(remaining)}` : 'Finalizando'}
                          </Text>
                          <Text style={[s.timerLabel, { color: remaining > 0 ? '#2563eb' : '#d97706' }]}>restante</Text>
                        </View>
                      </View>
                    );
                  })()}
                  <Text style={s.mySessionDetail}>
                    ⚡ {parseFloat(mySession.kwh_used || 0).toFixed(2)} kWh · 💰 ${Math.round(parseFloat(mySession.cost || 0)).toLocaleString('es-CO')} COP
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.btnStop]}
                  onPress={() => handleStop(cpId, mySession.transaction_id || mySession.transactionId)}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>⏹ Detener carga</Text>}
                </TouchableOpacity>
              </>
            ) : selectedCharger.status === 'Available' ? (
              <>
                <TouchableOpacity style={s.btnStart} onPress={() => handleStart(cpId)} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>⚡ Iniciar carga</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.btnReserve}
                  onPress={() => navigation.navigate('Reservations', {
                    stationId: id,
                    stationName: station.name,
                    chargers: station.chargers,
                    preselectedCpId: cpId,
                  })}
                >
                  <Text style={s.btnReserveText}>📅 Reservar turno</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={s.unavailBlock}>
                <Text style={s.unavailText}>
                  {selectedCharger.status === 'Unavailable' ? '🔧 En mantenimiento'
                    : selectedCharger.status === 'Faulted' ? '⚠️ Falla detectada'
                    : '🔌 Ocupado por otro usuario'}
                </Text>
                <TouchableOpacity
                  style={s.btnReserve}
                  onPress={() => navigation.navigate('Reservations', {
                    stationId: id, stationName: station.name, chargers: station.chargers, preselectedCpId: cpId,
                  })}
                >
                  <Text style={s.btnReserveText}>📅 Reservar para más tarde</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })()}

      {/* Aviso tarifa parqueo */}
      <View style={s.parkingNotice}>
        <Text style={s.parkingIcon}>🅿️</Text>
        <Text style={s.parkingText}>
          Tras finalizar la carga tienes <Text style={{ fontWeight: '700' }}>{PARKING_GRACE_MIN} min gratuitos</Text> para retirar tu vehículo.
          Después se cobrará <Text style={{ fontWeight: '700', color: '#dc2626' }}>${PARKING_FEE_PER_MIN}/min</Text> de parqueo adicional.
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#f8fafc' },
  center:               { flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' },

  /* Banner */
  banner:               { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a1628', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14, gap: 10 },
  backWrap:             { marginRight: 4 },
  backText:             { color: '#00e5b4', fontSize: 22, fontWeight: '700' },
  bannerLogo:           { width: 34, height: 34, borderRadius: 9, backgroundColor: '#00e5b4', justifyContent: 'center', alignItems: 'center' },
  bannerBolt:           { fontSize: 18 },
  bannerTitle:          { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  bannerSub:            { color: '#00e5b4', fontSize: 8, fontWeight: '700', letterSpacing: 3 },
  onlinePill:           { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1a2a3a', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  dot:                  { width: 8, height: 8, borderRadius: 4 },
  stationCard:          { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  stationIconWrap:      { width: 46, height: 46, borderRadius: 23, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  stationIcon:          { fontSize: 22 },
  stationName:          { color: '#1e293b', fontSize: 18, fontWeight: '800', marginBottom: 2 },
  stationAddress:       { color: '#94a3b8', fontSize: 13, marginBottom: 6 },
  wazeBtn:              { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#f0fdf4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#bbf7d0' },
  wazeIcon:             { fontSize: 14 },
  wazeBtnText:          { color: '#15803d', fontWeight: '700', fontSize: 13 },
  reserveLink:          { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  distBadge:            { backgroundColor: '#eff6ff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  distText:             { color: '#2563eb', fontWeight: '800', fontSize: 16 },
  distLabel:            { color: '#93c5fd', fontSize: 10 },
  section:              { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 18, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  sectionHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle:         { color: '#1e293b', fontSize: 16, fontWeight: '800' },
  connectorCard:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: '#e2e8f0' },
  connectorCardSelected:{ borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  connectorCardDisabled:{ opacity: 0.75 },
  connectorInfo:        { flex: 1, marginLeft: 14 },
  connectorStatus:      { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  connectorPrice:       { color: '#475569', fontSize: 13, marginBottom: 2 },
  connectorPower:       { color: '#64748b', fontSize: 12 },
  timerInline:          { marginTop: 6 },
  radioOuter:           { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#cbd5e1', justifyContent: 'center', alignItems: 'center' },
  radioOuterSelected:   { borderColor: '#2563eb' },
  radioInner:           { width: 12, height: 12, borderRadius: 6, backgroundColor: '#2563eb' },
  actionArea:           { marginHorizontal: 16, marginBottom: 14 },
  mySessionCard:        { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#2563eb', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  mySessionTitle:       { color: '#2563eb', fontWeight: '800', fontSize: 15, marginBottom: 12 },
  timerBig:             { flexDirection: 'row', gap: 10, marginBottom: 10 },
  timerBox:             { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, padding: 14, alignItems: 'center' },
  timerNum:             { color: '#1e293b', fontSize: 22, fontWeight: '800' },
  timerLabel:           { color: '#94a3b8', fontSize: 11, marginTop: 3 },
  mySessionDetail:      { color: '#64748b', fontSize: 13 },
  btnStart:             { backgroundColor: '#2563eb', borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 10 },
  btnStop:              { backgroundColor: '#dc2626', borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 10 },
  btnText:              { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnReserve:           { borderWidth: 1.5, borderColor: '#2563eb', borderRadius: 14, padding: 16, alignItems: 'center' },
  btnReserveText:       { color: '#2563eb', fontWeight: '700', fontSize: 15 },
  unavailBlock:         { marginBottom: 0 },
  unavailText:          { color: '#6b7280', fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  parkingNotice:        { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fefce8', marginHorizontal: 16, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#fde047' },
  parkingIcon:          { fontSize: 20, marginRight: 10, marginTop: 2 },
  parkingText:          { flex: 1, color: '#713f12', fontSize: 13, lineHeight: 20 },
});
