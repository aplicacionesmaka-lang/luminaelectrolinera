import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, ScrollView } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../services/AuthContext';

// URL que lleva al usuario a descargar la app o abrir la sesión directamente
const APP_STORE_URL  = 'https://apps.apple.com/app/lumina-ev/id0000000000';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.maka.lumina';
const DEEP_LINK_BASE = 'lumina://charge/';

export default function QRScreen({ navigation }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('personal'); // 'personal' | 'download'

  // QR personal: contiene el idTag del usuario para que el cargador lo autentique
  const personalQR = JSON.stringify({
    type: 'lumina_user',
    idTag: user?.idTag || user?.id_tag,
    userId: user?.id,
    name: user?.name,
  });

  // QR de descarga: link universal que detecta la plataforma
  const downloadQR = `https://lumina.app/download?ref=charger`;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Mi QR</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'personal' && s.tabActive]} onPress={() => setTab('personal')}>
          <Text style={[s.tabText, tab === 'personal' && s.tabTextActive]}>🔑 Mi código</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'download' && s.tabActive]} onPress={() => setTab('download')}>
          <Text style={[s.tabText, tab === 'download' && s.tabTextActive]}>📲 Compartir app</Text>
        </TouchableOpacity>
      </View>

      {tab === 'personal' ? (
        <View style={s.qrCard}>
          <View style={s.qrWrap}>
            <QRCode
              value={personalQR}
              size={220}
              color="#1e293b"
              backgroundColor="#fff"
              logo={undefined}
              logoSize={40}
              logoBorderRadius={8}
            />
          </View>

          <Text style={s.qrTitle}>Tu código personal de carga</Text>
          <Text style={s.qrSub}>
            Escanea este código en cualquier cargador Lumina para iniciar una sesión instantánea sin necesidad de abrir la app.
          </Text>

          <View style={s.infoRow}>
            <View style={s.infoBadge}>
              <Text style={s.infoBadgeText}>ID: {user?.idTag || user?.id_tag || '—'}</Text>
            </View>
            <View style={[s.infoBadge, { backgroundColor: '#dcfce7' }]}>
              <Text style={[s.infoBadgeText, { color: '#15803d' }]}>
                Saldo: ${(user?.balance || 0).toLocaleString('es-CO')}
              </Text>
            </View>
          </View>

          <View style={s.stepsCard}>
            <Text style={s.stepsTitle}>¿Cómo funciona?</Text>
            {[
              ['1', 'Llega al cargador Lumina'],
              ['2', 'Escanea este QR con el lector del cargador'],
              ['3', 'La carga inicia automáticamente'],
              ['4', 'Al terminar, desconecta tu vehículo en máx. 15 min'],
            ].map(([n, text]) => (
              <View key={n} style={s.step}>
                <View style={s.stepNum}><Text style={s.stepNumText}>{n}</Text></View>
                <Text style={s.stepText}>{text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={s.shareBtn}
            onPress={() => Share.share({ message: `Mi ID de carga Lumina: ${user?.idTag || user?.id_tag}`, title: 'Lumina EV' })}
          >
            <Text style={s.shareBtnText}>Compartir mi ID de carga</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.qrCard}>
          <View style={s.qrWrap}>
            <QRCode
              value={downloadQR}
              size={220}
              color="#2563eb"
              backgroundColor="#fff"
            />
          </View>

          <Text style={s.qrTitle}>Comparte Lumina</Text>
          <Text style={s.qrSub}>
            Escanea este QR para descargar la app, configurar el método de pago y empezar a cargar en minutos.
          </Text>

          <View style={s.stepsCard}>
            <Text style={s.stepsTitle}>Nuevo usuario — 4 pasos</Text>
            {[
              ['1', 'Escanea el QR del cargador o este código'],
              ['2', 'Descarga la app Lumina (iOS / Android)'],
              ['3', 'Crea tu cuenta y recarga saldo'],
              ['4', 'Vuelve al cargador y escanea tu QR personal'],
            ].map(([n, text]) => (
              <View key={n} style={s.step}>
                <View style={[s.stepNum, { backgroundColor: '#eff6ff' }]}>
                  <Text style={[s.stepNumText, { color: '#2563eb' }]}>{n}</Text>
                </View>
                <Text style={s.stepText}>{text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[s.shareBtn, { backgroundColor: '#2563eb' }]}
            onPress={() => Share.share({
              message: `Descarga Lumina EV y empieza a cargar tu auto eléctrico:\n\niOS: ${APP_STORE_URL}\nAndroid: ${PLAY_STORE_URL}`,
              title: 'Lumina — Carga inteligente para tu EV',
            })}
          >
            <Text style={s.shareBtnText}>Compartir enlace de descarga</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f8fafc' },
  header:         { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, paddingTop: 56 },
  backText:       { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  headerTitle:    { color: '#1e293b', fontSize: 18, fontWeight: '800' },
  tabs:           { flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#e2e8f0', borderRadius: 14, padding: 4, marginBottom: 16 },
  tab:            { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 12 },
  tabActive:      { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText:        { color: '#64748b', fontWeight: '600', fontSize: 13 },
  tabTextActive:  { color: '#1e293b', fontWeight: '800' },
  qrCard:         { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 20, padding: 24, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 4 },
  qrWrap:         { alignSelf: 'center', padding: 20, backgroundColor: '#fff', borderRadius: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  qrTitle:        { color: '#1e293b', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  qrSub:          { color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  infoRow:        { flexDirection: 'row', gap: 10, justifyContent: 'center', marginBottom: 20 },
  infoBadge:      { backgroundColor: '#f1f5f9', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  infoBadgeText:  { color: '#475569', fontWeight: '700', fontSize: 13 },
  stepsCard:      { backgroundColor: '#f8fafc', borderRadius: 14, padding: 16, marginBottom: 20 },
  stepsTitle:     { color: '#1e293b', fontWeight: '800', fontSize: 14, marginBottom: 12 },
  step:           { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  stepNum:        { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fef9c3', justifyContent: 'center', alignItems: 'center' },
  stepNumText:    { color: '#92400e', fontWeight: '800', fontSize: 13 },
  stepText:       { flex: 1, color: '#475569', fontSize: 13 },
  shareBtn:       { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, alignItems: 'center' },
  shareBtnText:   { color: '#fff', fontWeight: '800', fontSize: 15 },
});
