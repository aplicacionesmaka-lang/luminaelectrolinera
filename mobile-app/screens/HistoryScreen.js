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
      const [s, p] = await Promise.all([sessions.myHistory(), payments.history()]);
      setSesData(s);
      setPayData(p);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmt = iso => iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const cop = n => `$${Number(n || 0).toLocaleString('es-CO')} COP`;

  if (loading) return <View style={s.center}><ActivityIndicator color="#00e5b4" size="large" /></View>;

  return (
    <View style={s.container}>
      <Text style={s.title}>Historial</Text>

      <View style={s.tabs}>
        {['sessions', 'payments'].map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'sessions' ? 'Sesiones' : 'Pagos'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'sessions' ? (
        <FlatList
          data={sesData}
          keyExtractor={i => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#00e5b4" />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.row}>
                <Text style={s.cardTitle}>{item.chargePointId}</Text>
                <View style={[s.badge, { backgroundColor: item.status === 'Completed' ? '#052e16' : '#1c1917' }]}>
                  <Text style={[s.badgeText, { color: item.status === 'Completed' ? '#00e5b4' : '#f59e0b' }]}>{item.status}</Text>
                </View>
              </View>
              <View style={s.statsRow}>
                <Text style={s.stat}>⚡ {(item.kwhUsed || 0).toFixed(2)} kWh</Text>
                <Text style={s.stat}>💰 {cop(item.cost)}</Text>
              </View>
              <Text style={s.date}>{fmt(item.startedAt)} — {fmt(item.endedAt)}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={s.empty}>Sin sesiones registradas</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        />
      ) : (
        <FlatList
          data={payData}
          keyExtractor={i => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#00e5b4" />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.row}>
                <Text style={s.cardTitle}>{cop(item.amount)}</Text>
                <View style={[s.badge, { backgroundColor: item.status === 'Approved' ? '#052e16' : '#1c1917' }]}>
                  <Text style={[s.badgeText, { color: item.status === 'Approved' ? '#00e5b4' : '#f59e0b' }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={s.stat}>Proveedor: {item.provider?.toUpperCase()}</Text>
              <Text style={s.date}>{fmt(item.createdAt)}</Text>
            </View>
          )}
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
  title:         { color: '#fff', fontSize: 24, fontWeight: '800', padding: 20, paddingTop: 56 },
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
});
