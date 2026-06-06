import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { sessions } from '../services/api';

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function MonthBar({ month, kwh, maxKwh, sessions: cnt, cost }) {
  const pct = maxKwh > 0 ? kwh / maxKwh : 0;
  const [yr, mo] = month.split('-');
  const label = `${MONTHS_ES[parseInt(mo)-1]} ${yr.slice(2)}`;
  return (
    <View style={b.row}>
      <Text style={b.label}>{label}</Text>
      <View style={b.barWrap}>
        <View style={[b.bar, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      <View style={b.nums}>
        <Text style={b.kwh}>{kwh.toFixed(1)} kWh</Text>
        <Text style={b.sessions}>{cnt} cargas</Text>
      </View>
    </View>
  );
}

export default function MyStatsScreen({ navigation }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sessions.myStats()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={s.center}><ActivityIndicator color="#2563eb" size="large" /></View>;

  const maxKwh = data?.monthly?.length ? Math.max(...data.monthly.map(m => m.kwh)) : 1;
  const co2    = ((data?.totals?.kwh || 0) * 0.233).toFixed(1);

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.back}>←  Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>Mis Estadísticas</Text>
      </View>

      {/* KPIs */}
      <View style={s.kpiRow}>
        <View style={s.kpi}>
          <Text style={s.kpiNum}>{data?.totals?.sessions || 0}</Text>
          <Text style={s.kpiLabel}>Cargas totales</Text>
        </View>
        <View style={s.kpi}>
          <Text style={s.kpiNum}>{(data?.totals?.kwh || 0).toFixed(1)}</Text>
          <Text style={s.kpiLabel}>kWh totales</Text>
        </View>
        <View style={s.kpi}>
          <Text style={s.kpiNum}>{co2}</Text>
          <Text style={s.kpiLabel}>kg CO₂ ahorrado</Text>
        </View>
      </View>

      <View style={s.kpiRow}>
        <View style={[s.kpi, { flex: 1 }]}>
          <Text style={s.kpiNum}>${Math.round((data?.totals?.cost || 0) / 1000)}k</Text>
          <Text style={s.kpiLabel}>COP invertidos</Text>
        </View>
        <View style={[s.kpi, { flex: 1 }]}>
          <Text style={s.kpiNum}>{Math.round(data?.totals?.avg_minutes || 0)} min</Text>
          <Text style={s.kpiLabel}>Promedio por carga</Text>
        </View>
      </View>

      {/* Gráfico por mes */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Cargas por mes</Text>
        {(!data?.monthly?.length) ? (
          <Text style={s.empty}>Sin datos aún</Text>
        ) : (
          data.monthly.map(m => (
            <MonthBar key={m.month} {...m} maxKwh={maxKwh} />
          ))
        )}
      </View>

      {/* Estaciones más frecuentadas */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Estaciones favoritas</Text>
        {(!data?.byStation?.length) ? (
          <Text style={s.empty}>Sin datos aún</Text>
        ) : data.byStation.map((st, i) => (
          <View key={i} style={s.stRow}>
            <View style={s.stRank}>
              <Text style={s.stRankText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.stName}>{st.station_name || 'Estación'}</Text>
              <Text style={s.stCity}>{st.city}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.stKwh}>{parseFloat(st.kwh).toFixed(1)} kWh</Text>
              <Text style={s.stSessions}>{st.sessions} cargas</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  header:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, paddingTop: 56, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginBottom: 16 },
  back:      { color: '#2563eb', fontSize: 15, fontWeight: '700' },
  title:     { color: '#1e293b', fontSize: 20, fontWeight: '800' },
  kpiRow:    { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 10 },
  kpi:       { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  kpiNum:    { color: '#2563eb', fontSize: 22, fontWeight: '800' },
  kpiLabel:  { color: '#94a3b8', fontSize: 11, marginTop: 3, textAlign: 'center' },
  card:      { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 18, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardTitle: { color: '#1e293b', fontSize: 16, fontWeight: '800', marginBottom: 16 },
  empty:     { color: '#94a3b8', textAlign: 'center', marginVertical: 20 },
  stRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  stRank:    { width: 28, height: 28, borderRadius: 14, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stRankText:{ color: '#2563eb', fontWeight: '800', fontSize: 13 },
  stName:    { color: '#1e293b', fontWeight: '700', fontSize: 14 },
  stCity:    { color: '#94a3b8', fontSize: 12 },
  stKwh:     { color: '#2563eb', fontWeight: '700', fontSize: 13 },
  stSessions:{ color: '#94a3b8', fontSize: 11 },
});

const b = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  label:   { color: '#64748b', fontSize: 12, fontWeight: '600', width: 52 },
  barWrap: { flex: 1, height: 10, backgroundColor: '#f1f5f9', borderRadius: 5, overflow: 'hidden', marginHorizontal: 10 },
  bar:     { height: 10, backgroundColor: '#2563eb', borderRadius: 5 },
  nums:    { alignItems: 'flex-end', minWidth: 72 },
  kwh:     { color: '#1e293b', fontSize: 12, fontWeight: '700' },
  sessions:{ color: '#94a3b8', fontSize: 10 },
});
