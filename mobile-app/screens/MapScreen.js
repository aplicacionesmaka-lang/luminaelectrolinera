import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, ScrollView, RefreshControl } from 'react-native';
import * as Location from 'expo-location';
import { stations } from '../services/api';
import { useAuth } from '../services/AuthContext';

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export default function MapScreen({ navigation }) {
  const { user, refreshBalance } = useAuth();
  const [data,       setData]       = useState([]);
  const [filtered,   setFiltered]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cityFilter, setCityFilter] = useState('');
  const [cities,     setCities]     = useState([]);
  const [location,   setLocation]   = useState(null);
  const [locating,   setLocating]   = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await stations.list();
      setData(res);
      const uniqueCities = [...new Set(res.map(s => s.city).filter(Boolean))];
      setCities(uniqueCities);
      setFiltered(res);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); refreshBalance(); }, [load]);

  useEffect(() => {
    let list = cityFilter ? data.filter(s => s.city === cityFilter) : data;
    if (location) {
      list = [...list].sort((a, b) =>
        distKm(location.lat, location.lng, a.lat, a.lng) -
        distKm(location.lat, location.lng, b.lat, b.lng)
      );
    }
    setFiltered(list);
  }, [cityFilter, data, location]);

  async function handleLocate() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocating(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } finally {
      setLocating(false);
    }
  }

  const statusColor = s => ({ Available: '#00e5b4', Occupied: '#f59e0b', Unavailable: '#ef4444', Faulted: '#ef4444' }[s] || '#888');

  if (loading) return <View style={s.center}><ActivityIndicator color="#00e5b4" size="large" /></View>;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Electrolineras</Text>
        <TouchableOpacity style={s.balanceBadge} onPress={() => navigation.navigate('Topup')}>
          <Text style={s.balanceText}>💳 ${(user?.balance || 0).toLocaleString('es-CO')}</Text>
        </TouchableOpacity>
      </View>

      {/* Filtros */}
      <View style={s.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingRight: 8 }}>
          {[{ city: '' }, ...cities.map(c => ({ city: c }))].map(item => (
            <TouchableOpacity
              key={item.city || 'all'}
              style={[s.chip, cityFilter === item.city && s.chipActive]}
              onPress={() => setCityFilter(item.city)}
            >
              <Text style={[s.chipText, cityFilter === item.city && s.chipTextActive]}>
                {item.city || 'Todas'}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.locBtn} onPress={handleLocate} disabled={locating}>
            {locating
              ? <ActivityIndicator color="#00e5b4" size="small" />
              : <Text style={s.locText}>{location ? '📍 Cerca' : '📍 Ubícame'}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#00e5b4" />}
        renderItem={({ item }) => {
          const dist = location ? distKm(location.lat, location.lng, item.lat, item.lng) : null;
          return (
            <TouchableOpacity style={s.card} onPress={() => navigation.navigate('StationDetail', { stationId: item.id })}>
              <View style={s.cardTop}>
                <Text style={s.stationName}>{item.name}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={[s.dot, { backgroundColor: item.online ? '#00e5b4' : '#555' }]} />
                  {dist !== null && <Text style={s.dist}>{dist < 1 ? `${Math.round(dist*1000)}m` : `${dist.toFixed(1)}km`}</Text>}
                </View>
              </View>
              <Text style={s.cityTag}>{item.city}</Text>
              <Text style={s.address}>{item.address}</Text>
              <View style={s.connectors}>
                {(item.chargers || []).map((c, i) => (
                  <View key={i} style={[s.connector, { borderColor: statusColor(c.status) }]}>
                    <Text style={[s.connText, { color: statusColor(c.status) }]}>{c.max_power_kw || c.maxPowerKw}kW</Text>
                    <Text style={[s.connStatus, { color: statusColor(c.status) }]}>{c.status}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.price}>$1.200/kWh</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>No hay estaciones disponibles</Text>}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0f1117' },
  center:       { flex: 1, backgroundColor: '#0f1117', justifyContent: 'center', alignItems: 'center' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 56 },
  title:        { color: '#fff', fontSize: 24, fontWeight: '800' },
  balanceBadge: { backgroundColor: '#1a1d27', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  balanceText:  { color: '#00e5b4', fontWeight: '700', fontSize: 13 },
  filters:      { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  chip:         { backgroundColor: '#1a1d27', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  chipActive:   { backgroundColor: '#00e5b4' },
  chipText:     { color: '#888', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#0f1117' },
  locBtn:       { backgroundColor: '#1a1d27', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 16 },
  locText:      { color: '#00e5b4', fontWeight: '600', fontSize: 13 },
  card:         { backgroundColor: '#1a1d27', borderRadius: 16, padding: 18, marginBottom: 14 },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  stationName:  { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 },
  dot:          { width: 10, height: 10, borderRadius: 5 },
  dist:         { color: '#00e5b4', fontSize: 11, fontWeight: '600', marginTop: 2 },
  cityTag:      { color: '#00e5b4', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  address:      { color: '#888', fontSize: 13, marginBottom: 12 },
  connectors:   { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  connector:    { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  connText:     { fontWeight: '700', fontSize: 13 },
  connStatus:   { fontSize: 11, marginTop: 2 },
  price:        { color: '#888', fontSize: 12 },
  empty:        { color: '#888', textAlign: 'center', marginTop: 60 },
});
