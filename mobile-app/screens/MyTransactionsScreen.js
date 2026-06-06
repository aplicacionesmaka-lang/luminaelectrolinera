import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Modal, ScrollView, TextInput, Linking,
} from 'react-native';
import { sessions } from '../services/api';

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDate(d)    { return d instanceof Date ? d.toISOString().slice(0, 10) : d; }
const fmt = iso => iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const cop = n => `$${Math.round(n || 0).toLocaleString('es-CO')} COP`;

const SUPPORT_WHATSAPP = 'https://wa.me/573000000000?text=Hola,%20necesito%20soporte%20con%20mi%20transacci%C3%B3n%20Lumina';

function duration(start, end) {
  if (!start || !end) return '—';
  const min = Math.round((new Date(end) - new Date(start)) / 60000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min/60)}h ${min%60}min`;
}

function TransactionDetail({ tx, onClose }) {
  if (!tx) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={d.container}>
        <View style={d.header}>
          <TouchableOpacity onPress={onClose}><Text style={d.close}>✕</Text></TouchableOpacity>
          <Text style={d.title}>Detalle de transacción</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
          {/* Badge estado */}
          <View style={[d.badge, { backgroundColor: '#dcfce7', alignSelf: 'center', marginBottom: 20 }]}>
            <Text style={[d.badgeText, { color: '#15803d' }]}>✅ Exitosa</Text>
          </View>

          <Row label="ID Transacción"  value={tx.id} mono />
          <Row label="Estación"        value={tx.station_name || '—'} />
          <Row label="Ciudad"          value={tx.station_city || tx.city || '—'} />
          <Row label="Cargador"        value={tx.charge_point_id || '—'} mono />
          <Row label="Fecha inicio"    value={fmt(tx.started_at)} />
          <Row label="Fecha fin"       value={fmt(tx.ended_at)} />
          <Row label="Tiempo de carga" value={duration(tx.started_at, tx.ended_at)} highlight />
          <Row label="Energía cargada" value={`${parseFloat(tx.kwh_used || 0).toFixed(2)} kWh`} highlight />
          <Row label="Valor pagado"    value={cop(tx.cost)} highlight />
          <Row label="Tarifa"          value="$1.200 COP / kWh" />
          <Row label="Medio de pago"   value="Saldo Lumina" />

          <TouchableOpacity
            style={d.supportBtn}
            onPress={() => Linking.openURL(SUPPORT_WHATSAPP)}
          >
            <Text style={d.supportIcon}>💬</Text>
            <View>
              <Text style={d.supportText}>¿Problema con esta transacción?</Text>
              <Text style={d.supportSub}>Contactar soporte por WhatsApp</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({ label, value, highlight, mono }) {
  return (
    <View style={d.row}>
      <Text style={d.rowLabel}>{label}</Text>
      <Text style={[d.rowValue, highlight && { color: '#2563eb', fontWeight: '700' }, mono && { fontFamily: 'monospace', fontSize: 12 }]}>
        {value}
      </Text>
    </View>
  );
}

const QUICK_RANGES = [
  { label: 'Hoy',       days: 0 },
  { label: '7 días',    days: 7 },
  { label: '30 días',   days: 30 },
  { label: '3 meses',   days: 90 },
  { label: 'Todo',      days: 999 },
];

export default function MyTransactionsScreen({ navigation }) {
  const [data,      setData]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const [range,     setRange]     = useState(30);
  const [totals,    setTotals]    = useState({ sessions: 0, kwh: 0, cost: 0 });

  const load = useCallback(async (days) => {
    setLoading(true);
    try {
      const from = days < 999 ? fmtDate(addDays(new Date(), -days)) : undefined;
      const res  = await sessions.myHistory(from, undefined);
      const list = Array.isArray(res) ? res : [];
      setData(list);
      setTotals({
        sessions: list.length,
        kwh:  list.reduce((a, s) => a + parseFloat(s.kwh_used || 0), 0),
        cost: list.reduce((a, s) => a + parseFloat(s.cost || 0), 0),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range); }, [range]);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>←  Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>Mis Transacciones</Text>
      </View>

      {/* Filtro rápido por rango */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.rangeScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {QUICK_RANGES.map(r => (
          <TouchableOpacity
            key={r.days}
            style={[s.rangeChip, range === r.days && s.rangeChipActive]}
            onPress={() => setRange(r.days)}
          >
            <Text style={[s.rangeText, range === r.days && s.rangeTextActive]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Totales del período */}
      <View style={s.totalsRow}>
        <View style={s.totalBox}>
          <Text style={s.totalNum}>{totals.sessions}</Text>
          <Text style={s.totalLabel}>cargas</Text>
        </View>
        <View style={s.totalBox}>
          <Text style={s.totalNum}>{totals.kwh.toFixed(1)}</Text>
          <Text style={s.totalLabel}>kWh</Text>
        </View>
        <View style={s.totalBox}>
          <Text style={s.totalNum}>${Math.round(totals.cost / 1000)}k</Text>
          <Text style={s.totalLabel}>COP</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#059669" size="large" /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ListEmptyComponent={<Text style={s.empty}>Sin transacciones en este período</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => setSelected(item)} activeOpacity={0.85}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardStation}>{item.station_name || item.charge_point_id || '—'}</Text>
                  <Text style={s.cardCity}>{item.station_city || item.city || ''}</Text>
                </View>
                <View style={s.successBadge}>
                  <Text style={s.successText}>✅ Exitosa</Text>
                </View>
              </View>

              <View style={s.cardStats}>
                <View style={s.cardStat}>
                  <Text style={s.cardStatNum}>{parseFloat(item.kwh_used || 0).toFixed(2)}</Text>
                  <Text style={s.cardStatLabel}>kWh</Text>
                </View>
                <View style={s.cardStat}>
                  <Text style={s.cardStatNum}>{duration(item.started_at, item.ended_at)}</Text>
                  <Text style={s.cardStatLabel}>duración</Text>
                </View>
                <View style={s.cardStat}>
                  <Text style={[s.cardStatNum, { color: '#059669' }]}>{cop(item.cost)}</Text>
                  <Text style={s.cardStatLabel}>pagado</Text>
                </View>
              </View>

              <Text style={s.cardDate}>{fmt(item.started_at)}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <TransactionDetail tx={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f8fafc' },
  center:          { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:          { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, paddingTop: 56, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginBottom: 4 },
  back:            { color: '#059669', fontSize: 15, fontWeight: '700' },
  title:           { color: '#1e293b', fontSize: 18, fontWeight: '800' },
  rangeScroll:     { paddingVertical: 12 },
  rangeChip:       { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1.5, borderColor: '#e2e8f0' },
  rangeChipActive: { backgroundColor: '#059669', borderColor: '#059669' },
  rangeText:       { color: '#64748b', fontWeight: '600', fontSize: 13 },
  rangeTextActive: { color: '#fff' },
  totalsRow:       { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  totalBox:        { flex: 1, alignItems: 'center', paddingVertical: 14, borderRightWidth: 1, borderRightColor: '#f1f5f9' },
  totalNum:        { color: '#059669', fontSize: 20, fontWeight: '800' },
  totalLabel:      { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  card:            { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardTop:         { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  cardStation:     { color: '#1e293b', fontWeight: '700', fontSize: 15 },
  cardCity:        { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  successBadge:    { backgroundColor: '#dcfce7', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  successText:     { color: '#15803d', fontWeight: '700', fontSize: 11 },
  cardStats:       { flexDirection: 'row', backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 10 },
  cardStat:        { flex: 1, alignItems: 'center' },
  cardStatNum:     { color: '#1e293b', fontWeight: '800', fontSize: 15 },
  cardStatLabel:   { color: '#94a3b8', fontSize: 10, marginTop: 2 },
  cardDate:        { color: '#94a3b8', fontSize: 12 },
  empty:           { color: '#94a3b8', textAlign: 'center', marginTop: 60, fontSize: 15 },
});

const d = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#fff' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  close:       { color: '#64748b', fontSize: 20, fontWeight: '700' },
  title:       { color: '#1e293b', fontSize: 17, fontWeight: '800' },
  badge:       { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  badgeText:   { fontWeight: '800', fontSize: 14 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowLabel:    { color: '#94a3b8', fontSize: 13, flex: 1 },
  rowValue:    { color: '#1e293b', fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' },
  supportBtn:  { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#f0fdf4', borderRadius: 16, padding: 18, marginTop: 24, borderWidth: 1, borderColor: '#bbf7d0' },
  supportIcon: { fontSize: 28 },
  supportText: { color: '#15803d', fontWeight: '700', fontSize: 14 },
  supportSub:  { color: '#86efac', fontSize: 12, marginTop: 2 },
});
