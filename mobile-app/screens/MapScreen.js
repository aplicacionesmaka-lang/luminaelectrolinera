import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, ScrollView, RefreshControl, StatusBar } from 'react-native';
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
  const [connFilter, setConnFilter] = useState(''); // '' | 'CCS1' | 'CCS2'
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
    if (connFilter) {
      list = list.filter(s => (s.chargers || []).some(c =>
        (c.connector_type || c.connectorType || '') === connFilter
      ));
    }
    if (location) {
      list = [...list].sort((a, b) =>
        distKm(location.lat, location.lng, a.lat, a.lng) -
        distKm(location.lat, location.lng, b.lat, b.lng)
      );
    }
    setFiltered(list);
  }, [cityFilter, connFilter, data, location]);

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

  const statusColor = s => ({ Available: '#2563eb', Occupied: '#d97706', Unavailable: '#dc2626', Faulted: '#dc2626', Charging: '#d97706' }[s] || '#9ca3af');

  if (loading) return <View style={s.center}><ActivityIndicator color="#00e5b4" size="large" /></View>;

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a1628" />

      {/* Banner Lumina */}
      <View style={s.banner}>
        <View style={s.bannerLogo}>
          <Text style={s.bannerBolt}>⚡</Text>
        </View>
        <View>
          <Text style={s.bannerTitle}>LUMINA</Text>
          <Text style={s.bannerSub}>ELECTROLINERAS</Text>
        </View>
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

      {/* Filtro tipo de conector */}
      <View style={s.connFilters}>
        <Text style={s.connFiltersLabel}>Conector:</Text>
        {[['', 'Todos'], ['CCS1', 'CCS1'], ['CCS2', 'CCS2']].map(([val, label]) => (
          <TouchableOpacity
            key={val}
            style={[s.connChip, connFilter === val && s.connChipActive]}
            onPress={() => setConnFilter(val)}
          >
            <Text style={[s.connChipText, connFilter === val && s.connChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => String(i.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#00e5b4" />}
        renderItem={({ item }) => {
          const dist = location ? distKm(location.lat, location.lng, item.lat, item.lng) : null;
          const available = (item.chargers || []).filter(c => c.status === 'Available').length;
          const total     = (item.chargers || []).length;
          return (
            <TouchableOpacity style={s.card} onPress={() => navigation.navigate('StationDetail', { stationId: item.id })}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.stationName}>{item.name}</Text>
                  <Text style={s.cityTag}>{item.city}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[s.onlinePill, { backgroundColor: item.online ? '#00e5b420' : '#55555520' }]}>
                    <View style={[s.dot, { backgroundColor: item.online ? '#00e5b4' : '#555' }]} />
                    <Text style={[s.onlineText, { color: item.online ? '#00e5b4' : '#555' }]}>
                      {item.online ? 'En línea' : 'Offline'}
                    </Text>
                  </View>
                  {dist !== null && <Text style={s.dist}>{dist < 1 ? `${Math.round(dist*1000)}m` : `${dist.toFixed(1)}km`}</Text>}
                </View>
              </View>

              <Text style={s.address}>📍 {item.address}</Text>

              <View style={s.connectors}>
                {(item.chargers || []).map((c, idx) => (
                  <View key={idx} style={[s.connector, { borderColor: statusColor(c.status), backgroundColor: statusColor(c.status) + '15' }]}>
                    <Text style={[s.connText, { color: statusColor(c.status) }]}>{c.max_power_kw || c.maxPowerKw}kW</Text>
                    <Text style={[s.connType2, { color: statusColor(c.status) }]}>{c.connector_type || c.connectorType || 'CCS2'}</Text>
                  </View>
                ))}
              </View>

              <View style={s.cardFooter}>
                <Text style={s.price}>$1.200/kWh</Text>
                <View style={[s.availPill, { backgroundColor: available > 0 ? '#00e5b420' : '#f59e0b20' }]}>
                  <Text style={[s.availText, { color: available > 0 ? '#00e5b4' : '#f59e0b' }]}>
                    {available}/{total} disponibles
                  </Text>
                </View>
              </View>
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
  container:      { flex: 1, backgroundColor: '#0f1117' },
  center:         { flex: 1, backgroundColor: '#0f1117', justifyContent: 'center', alignItems: 'center' },

  /* Banner superior */
  banner:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a1628', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14, gap: 12 },
  bannerLogo:     { width: 38, height: 38, borderRadius: 10, backgroundColor: '#00e5b4', justifyContent: 'center', alignItems: 'center' },
  bannerBolt:     { fontSize: 20 },
  bannerTitle:    { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  bannerSub:      { color: '#00e5b4', fontSize: 9, fontWeight: '700', letterSpacing: 3 },
  balanceBadge:   { marginLeft: 'auto', backgroundColor: '#1a2a3a', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  balanceText:    { color: '#00e5b4', fontWeight: '700', fontSize: 13 },

  filters:        { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  chip:           { backgroundColor: '#1a1d27', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  chipActive:     { backgroundColor: '#00e5b4' },
  chipText:       { color: '#888', fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#0f1117' },
  locBtn:         { backgroundColor: '#1a1d27', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 16 },
  locText:        { color: '#00e5b4', fontWeight: '600', fontSize: 13 },

  card:           { backgroundColor: '#1a1d27', borderRadius: 16, padding: 18, marginBottom: 14 },
  cardTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  stationName:    { color: '#fff', fontSize: 17, fontWeight: '700' },
  dot:            { width: 8, height: 8, borderRadius: 4 },
  onlinePill:     { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  onlineText:     { fontSize: 11, fontWeight: '600' },
  dist:           { color: '#00e5b4', fontSize: 12, fontWeight: '700' },
  cityTag:        { color: '#00e5b4', fontSize: 12, fontWeight: '600', marginTop: 2 },
  address:        { color: '#888', fontSize: 13, marginBottom: 12 },
  connectors:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  connector:      { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center' },
  connText:       { fontWeight: '800', fontSize: 14 },
  connType2:      { fontSize: 10, marginTop: 2, fontWeight: '600' },
  cardFooter:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price:          { color: '#555', fontSize: 12 },
  availPill:      { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  availText:      { fontSize: 12, fontWeight: '700' },
  connFilters:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  connFiltersLabel:{ color: '#888', fontSize: 12, fontWeight: '600' },
  connChip:        { borderWidth: 1.5, borderColor: '#2a3040', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  connChipActive:  { backgroundColor: '#00e5b4', borderColor: '#00e5b4' },
  connChipText:    { color: '#888', fontWeight: '700', fontSize: 13 },
  connChipTextActive: { color: '#0f1117' },
  empty:          { color: '#888', textAlign: 'center', marginTop: 60 },
});
