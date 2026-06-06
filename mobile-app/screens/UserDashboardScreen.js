import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { useAuth } from '../services/AuthContext';

const CARDS = [
  {
    id: 'stats',
    screen: 'MyStats',
    icon: '📊',
    title: 'Mis Estadísticas',
    desc: 'Cargas por mes, kWh consumidos y estaciones favoritas',
    color: '#2563eb',
    bg: '#eff6ff',
  },
  {
    id: 'payments',
    screen: 'MyPaymentMethods',
    icon: '💳',
    title: 'Mis Medios de Pago',
    desc: 'Tarjetas registradas, favorita, movimientos recientes',
    color: '#7c3aed',
    bg: '#f5f3ff',
  },
  {
    id: 'transactions',
    screen: 'MyTransactions',
    icon: '🧾',
    title: 'Mis Transacciones',
    desc: 'Historial detallado, filtro por fecha y detalle de cada carga',
    color: '#059669',
    bg: '#ecfdf5',
  },
];

export default function UserDashboardScreen({ navigation }) {
  const { user } = useAuth();

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <StatusBar barStyle="light-content" backgroundColor="#0a1628" />

      {/* Banner */}
      <View style={s.banner}>
        <View style={s.bannerLogo}><Text style={s.bannerBolt}>⚡</Text></View>
        <View>
          <Text style={s.bannerTitle}>LUMINA</Text>
          <Text style={s.bannerSub}>ELECTROLINERAS</Text>
        </View>
      </View>

      {/* Saludo */}
      <View style={s.greeting}>
        <Text style={s.greetingHi}>Hola, {(user?.name || '').split(' ')[0]} 👋</Text>
        <Text style={s.greetingSub}>¿Qué quieres revisar hoy?</Text>
      </View>

      {/* Saldo */}
      <View style={s.balanceCard}>
        <Text style={s.balanceLabel}>Saldo disponible</Text>
        <Text style={s.balanceAmount}>${(user?.balance || 0).toLocaleString('es-CO')} COP</Text>
        <TouchableOpacity style={s.topupBtn} onPress={() => navigation.navigate('Topup')}>
          <Text style={s.topupText}>+ Recargar</Text>
        </TouchableOpacity>
      </View>

      {/* Cards de secciones */}
      <Text style={s.sectionLabel}>MI CUENTA</Text>
      {CARDS.map(card => (
        <TouchableOpacity
          key={card.id}
          style={s.card}
          onPress={() => navigation.navigate(card.screen)}
          activeOpacity={0.85}
        >
          <View style={[s.cardIcon, { backgroundColor: card.bg }]}>
            <Text style={s.cardIconText}>{card.icon}</Text>
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardTitle}>{card.title}</Text>
            <Text style={s.cardDesc}>{card.desc}</Text>
          </View>
          <Text style={[s.cardArrow, { color: card.color }]}>›</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={s.qrCard} onPress={() => navigation.navigate('QR')}>
        <Text style={s.qrCardText}>⬛ Mi código QR de carga</Text>
        <Text style={s.qrCardSub}>Escanea en el cargador para iniciar sin abrir la app</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f8fafc' },
  banner:         { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a1628', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14, gap: 12 },
  bannerLogo:     { width: 34, height: 34, borderRadius: 9, backgroundColor: '#00e5b4', justifyContent: 'center', alignItems: 'center' },
  bannerBolt:     { fontSize: 18 },
  bannerTitle:    { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  bannerSub:      { color: '#00e5b4', fontSize: 8, fontWeight: '700', letterSpacing: 3 },
  greeting:       { padding: 20, paddingBottom: 0 },
  greetingHi:     { color: '#1e293b', fontSize: 24, fontWeight: '800' },
  greetingSub:    { color: '#94a3b8', fontSize: 14, marginTop: 2 },
  balanceCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a1628', margin: 16, borderRadius: 18, padding: 20 },
  balanceLabel:   { color: '#94a3b8', fontSize: 12, flex: 1 },
  balanceAmount:  { color: '#00e5b4', fontSize: 20, fontWeight: '800', marginRight: 12 },
  topupBtn:       { backgroundColor: '#00e5b4', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  topupText:      { color: '#0a1628', fontWeight: '800', fontSize: 13 },
  sectionLabel:   { color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 2, paddingHorizontal: 20, marginBottom: 10 },
  card:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 18, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardIcon:       { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  cardIconText:   { fontSize: 24 },
  cardBody:       { flex: 1 },
  cardTitle:      { color: '#1e293b', fontSize: 16, fontWeight: '800', marginBottom: 3 },
  cardDesc:       { color: '#94a3b8', fontSize: 12, lineHeight: 18 },
  cardArrow:      { fontSize: 28, fontWeight: '300' },
  qrCard:         { backgroundColor: '#1e293b', marginHorizontal: 16, borderRadius: 16, padding: 18, marginTop: 4, alignItems: 'center' },
  qrCardText:     { color: '#fff', fontWeight: '800', fontSize: 15 },
  qrCardSub:      { color: '#64748b', fontSize: 12, marginTop: 4, textAlign: 'center' },
});
