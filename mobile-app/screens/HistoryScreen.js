import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { sessions, payments } from '../services/api';

export default function HistoryScreen() {
  const [tab,        setTab]        = useState('sessions');
  const [sesData,    setSesData]    = useState([]);
  const [payData,    setPayData]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ses, pay] = await Promise.all([sessions.myHistory(), payments.history()]);
      setSesData(Array.isArray(ses) ? ses : []);
      setPayData(Array.isArray(pay) ? pay : []);
    } catch {
      setSesData([]);
      setPayData([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmt = iso => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return '—'; }
  };
  const cop = n => `$${Number(n || 0).toLocaleString('es-CO')} COP`;

  // Totals
  const totalKwh  = sesData.reduce((a, s) => a + parseFloat(s.kwh_used || 0), 0);
  const totalCost = sesData.reduce((a, s) => a + parseFloat(s.cost || 0), 0);
  const totalTopup = payData.filter(p => p.status === 'Approved').reduce((a, p) => a + parseFloat(p.amount || 0), 0);

  if (loading) return <View style={s.center}><ActivityIndicator color="#00e5b4" size="large" /></View>;

  return (
    <View style={s.container}>
      <Text style={s.title}>Historial</Text>

      {/* Summary cards */}
      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryNum}>{sesData.length}</Text>
          <Text style={s.summaryLabel}>sesiones</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryNum}>{totalKwh.toFixed(1)}</Text>
          <Text style={s.summaryLabel}>kWh totales</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryNum}>${(totalCost / 1000).toFixed(0)}k</Text>
          <Text style={s.summaryLabel}>COP gastados</Text>
        </View>
      </View>

      <View style={s.tabs}>
        {['sessions', 'payments'].map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'sessions' ? '⚡ Sesiones' : '💳 Pagos'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'sessions' ? (
        <FlatList
          data={sesData}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#00e5b4" />}
          renderItem={({ item }) => {
            const completed = item.status === 'Completed';
            return (
              <View style={s.card}>
                <View style={s.row}>
                  <Text style={s.cardTitle}>{item.charge_point_id || '—'}</Text>
                  <View style={[s.badge, { backgroundColor: completed ? '#052e16' : '#1c1917' }]}>
                    <Text style={[s.badgeText, { color: completed ? '#00e5b4' : '#f59e0b' }]}>{item.status}</Text>
                  </View>
                </View>
                <View style={s.statsRow}>
                  <Text style={s.stat}>⚡ {parseFloat(item.kwh_used || 0).toFixed(2)} kWh</Text>
                  <Text style={s.stat}>💰 {cop(item.cost)}</Text>
                </View>
                <Text style={s.date}>{fmt(item.started_at)} — {fmt(item.ended_at)}</Text>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={s.empty}>Sin sesiones registradas</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        />
      ) : (
        <FlatList
          data={payData}
          keyExtractor={i => String(i.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#00e5b4" />}
          renderItem={({ item }) => {
            const approved = item.status === 'Approved';
            return (
              <View style={s.card}>
                <View style={s.row}>
                  <Text style={s.cardTitle}>{cop(item.amount)}</Text>
                  <View style={[s.badge, { backgroundColor: approved ? '#052e16' : '#1c1917' }]}>
                    <Text style={[s.badgeText, { color: approved ? '#00e5b4' : '#f59e0b' }]}>{item.status}</Text>
                  </View>
                </View>
                {item.provider && <Text style={s.stat}>Proveedor: {String(item.provider).toUpperCase()}</Text>}
                <Text style={s.date}>{fmt(item.created_at || item.createdAt)}</Text>
              </View>
            );
          }}
          ListFooterComponent={
            payData.length > 0 && totalTopup > 0 ? (
              <View style={s.footerNote}>
                <Text style={s.footerText}>Total recargado: <Text style={{ color: '#00e5b4', fontWeight: '700' }}>{cop(totalTopup)}</Text></Text>
              </View>
            ) : null
          }
          ListEmptyComponent={<Text style={s.empty}>Sin pagos registrados</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#0f1117' },
  center:        { flex: 1, backgroundColor: '#0f1117', justifyContent: 'center', alignItems: 'center' },
  title:         { color: '#fff', fontSize: 24, fontWeight: '800', padding: 20, paddingTop: 56, paddingBottom: 12 },
  summaryRow:    { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 12 },
  summaryCard:   { flex: 1, backgroundColor: '#1a1d27', borderRadius: 12, padding: 12, alignItems: 'center' },
  summaryNum:    { color: '#00e5b4', fontSize: 20, fontWeight: '800' },
  summaryLabel:  { color: '#555', fontSize: 11, marginTop: 2 },
  tabs:          { flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#1a1d27', borderRadius: 12, padding: 4, marginBottom: 8 },
  tab:           { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive:     { backgroundColor: '#00e5b4' },
  tabText:       { color: '#888', fontWeight: '600' },
  tabTextActive: { color: '#0f1117', fontWeight: '700' },
  card:          { backgroundColor: '#1a1d27', borderRadius: 14, padding: 16, marginBottom: 12 },
  row:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  badge:         { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:     { fontSize: 12, fontWeight: '700' },
  statsRow:      { flexDirection: 'row', gap: 16, marginBottom: 6 },
  stat:          { color: '#aaa', fontSize: 13 },
  date:          { color: '#555', fontSize: 12 },
  empty:         { color: '#888', textAlign: 'center', marginTop: 60 },
  footerNote:    { padding: 16, alignItems: 'center' },
  footerText:    { color: '#888', fontSize: 13 },
});
