import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { reservations } from '../services/api';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h) {
  const ampm = h < 12 ? 'AM' : 'PM';
  const hr   = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(hr).padStart(2,'0')}:00 ${ampm}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function fmtDateLabel(d) {
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function ReservationScreen({ route, navigation }) {
  const { stationId, stationName, chargers = [], preselectedCpId } = route.params || {};

  const today = new Date(); today.setHours(0,0,0,0);
  const [selectedDate, setSelectedDate]   = useState(today);
  const [selectedCp,   setSelectedCp]     = useState(preselectedCpId || chargers[0]?.charge_point_id || chargers[0]?.id || '');
  const [selectedHour, setSelectedHour]   = useState(null);
  const [duration,     setDuration]       = useState(1);
  const [slots,        setSlots]          = useState([]);
  const [myRes,        setMyRes]          = useState([]);
  const [loadingSlots, setLoadingSlots]   = useState(false);
  const [submitting,   setSubmitting]     = useState(false);

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  const loadSlots = useCallback(async () => {
    if (!selectedCp) return;
    setLoadingSlots(true);
    try {
      const data = await reservations.availability(selectedCp, fmtDate(selectedDate));
      setSlots(data);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [selectedCp, selectedDate]);

  const loadMy = useCallback(async () => {
    try {
      const data = await reservations.my();
      setMyRes(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => { loadSlots(); loadMy(); }, [loadSlots]);

  async function handleReserve() {
    if (selectedHour === null) return Alert.alert('Selecciona una hora');
    setSubmitting(true);
    try {
      await reservations.create({
        stationId,
        chargePointId: selectedCp,
        reservedDate:  fmtDate(selectedDate),
        timeSlot:      selectedHour,
        durationHours: duration,
      });
      Alert.alert('✅ Reserva confirmada', `${stationName}\n${formatHour(selectedHour)} — ${fmtDateLabel(selectedDate)}`);
      setSelectedHour(null);
      loadSlots();
      loadMy();
    } catch (err) {
      Alert.alert('Error', err.error || 'No se pudo reservar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(resId) {
    Alert.alert('Cancelar reserva', '¿Confirmas la cancelación?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            await reservations.cancel(resId);
            loadMy(); loadSlots();
          } catch (err) {
            Alert.alert('Error', err.error || 'No se pudo cancelar');
          }
        },
      },
    ]);
  }

  const selectedCpObj = chargers.find(c => (c.charge_point_id || c.id) === selectedCp);
  const connType = selectedCpObj?.connector_type || selectedCpObj?.connectorType || '';

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Reservar turno</Text>
      </View>

      <Text style={s.stationName}>{stationName}</Text>

      {/* Selector cargador */}
      {chargers.length > 1 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Cargador</Text>
          <View style={s.row}>
            {chargers.map(c => {
              const cpId = c.charge_point_id || c.id;
              const ct   = c.connector_type || c.connectorType;
              return (
                <TouchableOpacity
                  key={cpId}
                  style={[s.cpChip, selectedCp === cpId && s.cpChipActive]}
                  onPress={() => { setSelectedCp(cpId); setSelectedHour(null); }}
                >
                  <Text style={[s.cpChipText, selectedCp === cpId && s.cpChipTextActive]}>{ct}</Text>
                  <Text style={[s.cpChipSub, selectedCp === cpId && { color: '#2563eb' }]}>{c.max_power_kw || c.maxPowerKw}kW</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Selector fecha */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Fecha</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {days.map((d, i) => {
            const isToday = fmtDate(d) === fmtDate(today);
            const active  = fmtDate(d) === fmtDate(selectedDate);
            return (
              <TouchableOpacity
                key={i}
                style={[s.dayChip, active && s.dayChipActive]}
                onPress={() => { setSelectedDate(d); setSelectedHour(null); }}
              >
                <Text style={[s.dayChipWeekday, active && { color: '#fff' }]}>
                  {isToday ? 'Hoy' : d.toLocaleDateString('es-CO', { weekday: 'short' })}
                </Text>
                <Text style={[s.dayChipNum, active && { color: '#fff' }]}>
                  {d.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Selector hora */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Hora {connType ? `(${connType})` : ''}</Text>
        {loadingSlots ? (
          <ActivityIndicator color="#2563eb" style={{ marginVertical: 20 }} />
        ) : (
          <View style={s.slotsGrid}>
            {HOURS.filter(h => h >= 6 && h <= 22).map(h => {
              const slot    = slots.find(sl => sl.hour === h);
              const avail   = slot?.available !== false;
              const active  = selectedHour === h;
              return (
                <TouchableOpacity
                  key={h}
                  style={[s.slotBtn, active && s.slotBtnActive, !avail && s.slotBtnOff]}
                  onPress={() => avail && setSelectedHour(active ? null : h)}
                  disabled={!avail}
                >
                  <Text style={[s.slotText, active && s.slotTextActive, !avail && s.slotTextOff]}>
                    {String(h).padStart(2,'0')}:00
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Duración */}
      {selectedHour !== null && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Duración</Text>
          <View style={s.row}>
            {[1, 2, 3, 4].map(d => (
              <TouchableOpacity
                key={d}
                style={[s.durChip, duration === d && s.durChipActive]}
                onPress={() => setDuration(d)}
              >
                <Text style={[s.durText, duration === d && s.durTextActive]}>{d}h</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Resumen + botón */}
      {selectedHour !== null && (
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>Resumen de reserva</Text>
          <Row label="Estación" value={stationName} />
          <Row label="Cargador" value={`${selectedCp} (${connType})`} />
          <Row label="Fecha" value={fmtDateLabel(selectedDate)} />
          <Row label="Hora" value={`${formatHour(selectedHour)} — ${formatHour((selectedHour + duration) % 24)}`} />
          <Row label="Duración" value={`${duration} hora${duration > 1 ? 's' : ''}`} />

          <TouchableOpacity style={s.btnReserve} onPress={handleReserve} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Confirmar reserva</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Mis reservas próximas */}
      {myRes.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Mis reservas próximas</Text>
          {myRes.map(r => (
            <View key={r.id} style={s.myResCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.myResStation}>{r.station_name || r.charge_point_id}</Text>
                <Text style={s.myResDetail}>
                  {new Date(r.reserved_date).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}{formatHour(r.time_slot)}
                  {' · '}{r.duration_hours}h
                </Text>
                <Text style={s.myResCp}>{r.charge_point_id}</Text>
              </View>
              <TouchableOpacity style={s.cancelBtn} onPress={() => handleCancel(r.id)}>
                <Text style={s.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
      <Text style={{ color: '#94a3b8', fontSize: 13 }}>{label}</Text>
      <Text style={{ color: '#1e293b', fontSize: 13, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#f8fafc' },
  header:            { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, paddingTop: 56 },
  backText:          { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  headerTitle:       { color: '#1e293b', fontSize: 18, fontWeight: '800' },
  stationName:       { color: '#64748b', fontSize: 14, paddingHorizontal: 20, marginBottom: 16 },
  section:           { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 18, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  sectionTitle:      { color: '#1e293b', fontSize: 15, fontWeight: '800', marginBottom: 12 },
  row:               { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  cpChip:            { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  cpChipActive:      { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  cpChipText:        { color: '#64748b', fontWeight: '700', fontSize: 14 },
  cpChipTextActive:  { color: '#2563eb' },
  cpChipSub:         { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  dayChip:           { alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8 },
  dayChipActive:     { backgroundColor: '#2563eb' },
  dayChipWeekday:    { color: '#64748b', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  dayChipNum:        { color: '#1e293b', fontSize: 20, fontWeight: '800' },
  slotsGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotBtn:           { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minWidth: 64, alignItems: 'center' },
  slotBtnActive:     { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  slotBtnOff:        { backgroundColor: '#f1f5f9', borderColor: '#f1f5f9' },
  slotText:          { color: '#475569', fontWeight: '600', fontSize: 13 },
  slotTextActive:    { color: '#fff' },
  slotTextOff:       { color: '#cbd5e1' },
  durChip:           { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  durChipActive:     { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  durText:           { color: '#475569', fontWeight: '700', fontSize: 15 },
  durTextActive:     { color: '#fff' },
  summaryCard:       { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 20, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  summaryTitle:      { color: '#1e293b', fontSize: 16, fontWeight: '800', marginBottom: 16 },
  btnReserve:        { backgroundColor: '#2563eb', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 8 },
  btnText:           { color: '#fff', fontWeight: '800', fontSize: 16 },
  myResCard:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  myResStation:      { color: '#1e293b', fontWeight: '700', fontSize: 14 },
  myResDetail:       { color: '#64748b', fontSize: 12, marginTop: 2 },
  myResCp:           { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  cancelBtn:         { borderWidth: 1.5, borderColor: '#fca5a5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  cancelText:        { color: '#dc2626', fontWeight: '700', fontSize: 12 },
});
