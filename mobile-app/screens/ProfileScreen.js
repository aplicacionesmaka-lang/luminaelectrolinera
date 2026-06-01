import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../services/AuthContext';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();

  function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Mi perfil</Text>

      <View style={s.avatar}>
        <Text style={s.avatarText}>{(user?.name || 'U')[0].toUpperCase()}</Text>
      </View>

      <Text style={s.name}>{user?.name || '—'}</Text>
      <Text style={s.email}>{user?.email || '—'}</Text>

      <View style={s.infoCard}>
        <Row label="ID de carga" value={user?.idTag || '—'} />
        <Row label="Saldo" value={`$${(user?.balance || 0).toLocaleString('es-CO')} COP`} highlight />
        <Row label="Rol" value={user?.role || 'user'} />
      </View>

      <TouchableOpacity style={s.topupBtn} onPress={() => navigation.navigate('Topup')}>
        <Text style={s.topupText}>💳 Recargar saldo</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Text style={s.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
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
  container: { flex: 1, backgroundColor: '#0f1117', padding: 24, paddingTop: 56 },
  title:     { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 32 },
  avatar:    { width: 80, height: 80, borderRadius: 40, backgroundColor: '#00e5b4', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 14 },
  avatarText:{ color: '#0f1117', fontSize: 36, fontWeight: '800' },
  name:      { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  email:     { color: '#888', textAlign: 'center', marginBottom: 28 },
  infoCard:  { backgroundColor: '#1a1d27', borderRadius: 16, padding: 4, marginBottom: 24 },
  topupBtn:  { backgroundColor: '#00e5b4', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 12 },
  topupText: { color: '#0f1117', fontWeight: '700', fontSize: 16 },
  logoutBtn: { borderWidth: 1.5, borderColor: '#ef4444', borderRadius: 14, padding: 16, alignItems: 'center' },
  logoutText:{ color: '#ef4444', fontWeight: '700', fontSize: 16 },
});

const r = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#0f1117' },
  label: { color: '#888', fontSize: 14 },
  value: { color: '#fff', fontSize: 14 },
});
