import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../services/AuthContext';
import { sessions } from '../services/api';

const LEVELS = [
  { name: 'Explorador',  min: 0,    color: '#6b7280', icon: '🌱' },
  { name: 'Conductor',   min: 5,    color: '#00e5b4', icon: '🚗' },
  { name: 'Eco Rider',   min: 20,   color: '#22d3ee', icon: '⚡' },
  { name: 'Cargador Pro',min: 50,   color: '#a78bfa', icon: '🔋' },
  { name: 'Embajador',   min: 100,  color: '#fbbf24', icon: '🏆' },
];

function getLevel(count) {
  let level = LEVELS[0];
  for (const l of LEVELS) { if (count >= l.min) level = l; }
  const idx  = LEVELS.indexOf(level);
  const next = LEVELS[idx + 1];
  const progress = next ? (count - level.min) / (next.min - level.min) : 1;
  return { ...level, next, progress: Math.min(progress, 1) };
}

export default function ProfileScreen({ navigation }) {
  const { user, logout, refreshBalance } = useAuth();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await sessions.myHistory();
        const list = Array.isArray(data) ? data : [];
        const completed = list.filter(s => s.status === 'Completed');
        const totalKwh  = completed.reduce((a, s) => a + parseFloat(s.kwh_used || 0), 0);
        const totalCost = completed.reduce((a, s) => a + parseFloat(s.cost || 0), 0);
        setStats({ count: completed.length, kwh: totalKwh, cost: totalCost });
      } catch {
        setStats({ count: 0, kwh: 0, cost: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: logout },
    ]);
  }

  const level = getLevel(stats?.count || 0);
  const co2Saved = ((stats?.kwh || 0) * 0.233).toFixed(1);

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={s.title}>Mi perfil</Text>

      {/* Avatar + nombre */}
      <View style={s.avatarSection}>
        <View style={[s.avatar, { borderColor: level.color }]}>
          <Text style={s.avatarText}>{(user?.name || 'U')[0].toUpperCase()}</Text>
        </View>
        <Text style={s.name}>{user?.name || '—'}</Text>
        <Text style={s.email}>{user?.email || '—'}</Text>
        <View style={[s.levelBadge, { backgroundColor: level.color + '22', borderColor: level.color }]}>
          <Text style={[s.levelText, { color: level.color }]}>{level.icon} {level.name}</Text>
        </View>
      </View>

      {/* Barra de progreso de nivel */}
      {level.next && (
        <View style={s.progressSection}>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${Math.round(level.progress * 100)}%`, backgroundColor: level.color }]} />
          </View>
          <Text style={s.progressLabel}>
            {stats?.count || 0} sesiones → {level.next.name} a las {level.next.min}
          </Text>
        </View>
      )}

      {/* Stats */}
      {loading ? (
        <ActivityIndicator color="#00e5b4" style={{ marginVertical: 20 }} />
      ) : (
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{stats?.count || 0}</Text>
            <Text style={s.statLabel}>sesiones</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{(stats?.kwh || 0).toFixed(1)}</Text>
            <Text style={s.statLabel}>kWh</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{co2Saved}</Text>
            <Text style={s.statLabel}>kg CO₂ ahorrado</Text>
          </View>
        </View>
      )}

      {/* Info cuenta */}
      <View style={s.infoCard}>
        <Row label="ID de carga" value={user?.idTag || user?.id_tag || '—'} />
        <Row label="Saldo disponible" value={`$${(user?.balance || 0).toLocaleString('es-CO')} COP`} highlight />
        <Row label="Ciudad" value={user?.city || '—'} />
        <Row label="Rol" value={user?.role === 'admin' ? '⭐ Admin' : 'Usuario'} />
      </View>

      <TouchableOpacity style={s.topupBtn} onPress={() => navigation.navigate('Topup')}>
        <Text style={s.topupText}>💳 Recargar saldo</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.qrBtn} onPress={() => navigation.navigate('QR')}>
        <Text style={s.qrText}>⬛ Mi código QR de carga</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.refreshBtn} onPress={async () => { await refreshBalance(); }}>
        <Text style={s.refreshText}>🔄 Actualizar saldo</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value, highlight }) {
  return (
    <View style={r.row}>
      <Text style={r.label}>{label}</Text>
      <Text style={[r.value, highlight && { color: '#00e5b4', fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#0f1117' },
  title:           { color: '#fff', fontSize: 24, fontWeight: '800', padding: 20, paddingTop: 56 },
  avatarSection:   { alignItems: 'center', paddingBottom: 20 },
  avatar:          { width: 84, height: 84, borderRadius: 42, backgroundColor: '#1a1d27', justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 2.5 },
  avatarText:      { color: '#00e5b4', fontSize: 38, fontWeight: '800' },
  name:            { color: '#fff', fontSize: 20, fontWeight: '700' },
  email:           { color: '#888', marginBottom: 10 },
  levelBadge:      { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 5 },
  levelText:       { fontWeight: '700', fontSize: 13 },
  progressSection: { paddingHorizontal: 20, marginBottom: 16 },
  progressBar:     { height: 6, backgroundColor: '#1a1d27', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill:    { height: 6, borderRadius: 3 },
  progressLabel:   { color: '#555', fontSize: 11, textAlign: 'center' },
  statsRow:        { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 20 },
  statCard:        { flex: 1, backgroundColor: '#1a1d27', borderRadius: 14, padding: 14, alignItems: 'center' },
  statNum:         { color: '#00e5b4', fontSize: 20, fontWeight: '800' },
  statLabel:       { color: '#555', fontSize: 11, marginTop: 3, textAlign: 'center' },
  infoCard:        { backgroundColor: '#1a1d27', borderRadius: 16, marginHorizontal: 20, padding: 4, marginBottom: 20 },
  topupBtn:        { backgroundColor: '#00e5b4', borderRadius: 14, padding: 16, alignItems: 'center', marginHorizontal: 20, marginBottom: 12 },
  topupText:       { color: '#0f1117', fontWeight: '700', fontSize: 16 },
  qrBtn:           { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, alignItems: 'center', marginHorizontal: 20, marginBottom: 12 },
  qrText:          { color: '#fff', fontWeight: '700', fontSize: 15 },
  refreshBtn:      { borderWidth: 1.5, borderColor: '#1a1d27', borderRadius: 14, padding: 14, alignItems: 'center', marginHorizontal: 20, marginBottom: 12 },
  refreshText:     { color: '#888', fontWeight: '600', fontSize: 15 },
  logoutBtn:       { borderWidth: 1.5, borderColor: '#ef4444', borderRadius: 14, padding: 16, alignItems: 'center', marginHorizontal: 20 },
  logoutText:      { color: '#ef4444', fontWeight: '700', fontSize: 16 },
});

const r = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#0f1117' },
  label: { color: '#888', fontSize: 14 },
  value: { color: '#fff', fontSize: 14 },
});
