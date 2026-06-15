import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Linking, ScrollView, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { payments } from '../services/api';
import { useAuth } from '../services/AuthContext';

const AMOUNTS = [10000, 20000, 50000, 100000, 200000];

const PROVIDERS = [
  {
    id:      'wompi',
    label:   'Tarjeta / PSE / Nequi QR',
    sub:     'Powered by Wompi · Bancolombia',
    icon:    '💳',
    color:   '#00b4d8',
    methods: ['Visa', 'Mastercard', 'PSE', 'Nequi QR'],
  },
  {
    id:      'payu',
    label:   'Tarjeta de crédito / débito',
    sub:     'Powered by PayU',
    icon:    '🏦',
    color:   '#ff6b35',
    methods: ['Visa', 'Mastercard', 'Amex', 'Diners', 'PSE'],
  },
  {
    id:      'nequi',
    label:   'Nequi Push',
    sub:     'Paga directo desde tu app Nequi',
    icon:    '📱',
    color:   '#6c11cc',
    methods: ['Nequi'],
  },
];

const fmt = n => `$${Math.round(n || 0).toLocaleString('es-CO')}`;

function buildPayuHtml(formData) {
  const inputs = Object.entries(formData)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}" />`)
    .join('\n');
  const action = formData.test === '1'
    ? 'https://sandbox.checkout.payulatam.com/ppp-web-gateway-payu'
    : 'https://checkout.payulatam.com/ppp-web-gateway-payu';
  return `<!DOCTYPE html><html><body onload="document.forms[0].submit()">
    <form method="POST" action="${action}">${inputs}</form>
    <p style="font-family:sans-serif;text-align:center;margin-top:60px;color:#333">Redirigiendo a PayU...</p>
  </body></html>`;
}

export default function TopupScreen({ navigation }) {
  const { user, refreshBalance } = useAuth();
  const [amount,    setAmount]    = useState('');
  const [custom,    setCustom]    = useState('');
  const [provider,  setProvider]  = useState('wompi');
  const [loading,   setLoading]   = useState(false);
  const [webUrl,    setWebUrl]    = useState(null);
  const [payuHtml,  setPayuHtml]  = useState(null);
  const [nequiData, setNequiData] = useState(null);
  const [checking,  setChecking]  = useState(false);

  const selected  = amount || parseInt(custom.replace(/\D/g, ''), 10) || 0;
  const provInfo  = PROVIDERS.find(p => p.id === provider);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url?.includes('lumina://payment') || url?.includes('payment/result')) {
        handleReturn();
      }
    });
    return () => sub.remove();
  }, []);

  async function handleReturn() {
    setWebUrl(null);
    setPayuHtml(null);
    setChecking(true);
    await new Promise(r => setTimeout(r, 2500));
    await refreshBalance();
    setChecking(false);
    Alert.alert('Recarga procesada', 'Tu saldo se actualizará en breve si el pago fue aprobado.');
  }

  async function handleTopup() {
    if (!selected || selected < 5000)
      return Alert.alert('Monto inválido', 'El monto mínimo es $5.000 COP');
    setLoading(true);
    try {
      const res = await payments.topup(selected, provider, 'lumina://payment/result');

      if (provider === 'wompi') {
        setWebUrl(res.checkoutUrl);
      } else if (provider === 'payu') {
        setPayuHtml(buildPayuHtml(res.formData));
      } else if (provider === 'nequi') {
        setNequiData(res);
        const canOpen = await Linking.canOpenURL(res.deeplink).catch(() => false);
        if (canOpen) await Linking.openURL(res.deeplink);
      }
    } catch (err) {
      Alert.alert('Error', err?.error || err?.message || 'No se pudo iniciar el pago');
    } finally {
      setLoading(false);
    }
  }

  async function handleNequiConfirm() {
    setChecking(true);
    await new Promise(r => setTimeout(r, 2000));
    await refreshBalance();
    setChecking(false);
    setNequiData(null);
    Alert.alert('Verificado', 'Si el pago fue enviado, tu saldo se actualizará en segundos.');
  }

  // ── WebView Wompi / PayU ──────────────────────────────────────────────────
  if (webUrl || payuHtml) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={wv.header}>
          <TouchableOpacity onPress={() => { setWebUrl(null); setPayuHtml(null); }}>
            <Text style={wv.close}>✕ Cancelar</Text>
          </TouchableOpacity>
          <Text style={wv.title}>
            {provider === 'wompi' ? '🔒 Pago seguro · Wompi' : '🔒 Pago seguro · PayU'}
          </Text>
          <View style={{ width: 70 }} />
        </View>
        <WebView
          source={webUrl ? { uri: webUrl } : { html: payuHtml }}
          onNavigationStateChange={({ url }) => {
            if (url?.includes('lumina://') || url?.includes('payment/result')) handleReturn();
          }}
          style={{ flex: 1 }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => <ActivityIndicator color="#00e5b4" size="large" style={{ marginTop: 60 }} />}
        />
      </View>
    );
  }

  // ── Instrucciones Nequi ───────────────────────────────────────────────────
  if (nequiData) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setNequiData(null)}>
            <Text style={s.backText}>←  Volver</Text>
          </TouchableOpacity>
          <Text style={s.title}>Pago con Nequi</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View style={nq.card}>
            <Text style={nq.icon}>📱</Text>
            <Text style={nq.title}>Paga con Nequi</Text>
            <Text style={nq.amount}>{fmt(nequiData.amount)} COP</Text>

            {[
              ['1', 'Abre tu app Nequi'],
              ['2', `Toca "Pagar" e ingresa el número\n${nequiData.phone}`],
              ['3', `Monto: ${fmt(nequiData.amount)} COP`],
              ['4', `Referencia: ${nequiData.reference}`],
            ].map(([n, txt]) => (
              <View key={n} style={nq.step}>
                <View style={nq.stepBadge}><Text style={nq.stepNum}>{n}</Text></View>
                <Text style={nq.stepText}>{txt}</Text>
              </View>
            ))}

            <TouchableOpacity
              style={nq.openBtn}
              onPress={() => Linking.openURL(nequiData.deeplink).catch(() =>
                Alert.alert('Nequi no instalado', 'Descarga la app Nequi desde tu tienda de aplicaciones.')
              )}
            >
              <Text style={nq.openBtnText}>Abrir app Nequi</Text>
            </TouchableOpacity>

            <TouchableOpacity style={nq.confirmBtn} onPress={handleNequiConfirm} disabled={checking}>
              {checking
                ? <ActivityIndicator color="#6c11cc" />
                : <Text style={nq.confirmBtnText}>Ya pagué · Verificar saldo</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Pantalla principal ────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.backText}>←  Volver</Text>
        </TouchableOpacity>
        <Text style={s.title}>Recargar wallet</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>Saldo disponible</Text>
          <Text style={s.balanceAmount}>{fmt(user?.balance)}</Text>
          <Text style={s.balanceCurrency}>COP</Text>
          <Text style={s.balanceSub}>Se descuenta automáticamente al cargar tu vehículo</Text>
        </View>

        <Text style={s.sectionLabel}>MONTO A RECARGAR</Text>
        <View style={s.amountsGrid}>
          {AMOUNTS.map(a => (
            <TouchableOpacity
              key={a}
              style={[s.amountBtn, amount === a && s.amountSelected]}
              onPress={() => { setAmount(a); setCustom(''); }}
            >
              <Text style={[s.amountText, amount === a && s.amountTextSelected]}>{fmt(a)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={s.customInput}
          placeholder="Otro monto  (mín. $5.000)"
          placeholderTextColor="#555"
          keyboardType="numeric"
          value={custom}
          onChangeText={v => { setCustom(v); setAmount(''); }}
        />

        <Text style={s.sectionLabel}>MÉTODO DE PAGO</Text>
        {PROVIDERS.map(prov => (
          <TouchableOpacity
            key={prov.id}
            style={[s.provCard, provider === prov.id && { borderColor: prov.color, borderWidth: 2 }]}
            onPress={() => setProvider(prov.id)}
            activeOpacity={0.85}
          >
            <View style={[s.provIconBox, { backgroundColor: prov.color + '22' }]}>
              <Text style={{ fontSize: 22 }}>{prov.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.provLabel}>{prov.label}</Text>
              <Text style={s.provSub}>{prov.sub}</Text>
              <View style={s.methodsRow}>
                {prov.methods.map(m => (
                  <View key={m} style={s.methodBadge}>
                    <Text style={s.methodText}>{m}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={[s.radio, provider === prov.id && { borderColor: prov.color }]}>
              {provider === prov.id && <View style={[s.radioDot, { backgroundColor: prov.color }]} />}
            </View>
          </TouchableOpacity>
        ))}

        <View style={s.securityNote}>
          <Text style={s.securityIcon}>🔒</Text>
          <Text style={s.securityText}>
            Lumina <Text style={{ fontWeight: '800', color: '#aaa' }}>nunca almacena</Text> datos de tu tarjeta.
            El pago es procesado directamente por {provInfo?.sub?.split('·')[0]?.trim()}, certificada PCI-DSS.
          </Text>
        </View>

        {checking && (
          <View style={s.checkingBox}>
            <ActivityIndicator color="#00e5b4" />
            <Text style={{ color: '#00e5b4', marginLeft: 10, fontWeight: '600' }}>Verificando pago...</Text>
          </View>
        )}

        <TouchableOpacity
          style={[s.btn, (!selected || selected < 5000 || loading) && { opacity: 0.4 }]}
          onPress={handleTopup}
          disabled={loading || !selected || selected < 5000}
        >
          {loading
            ? <ActivityIndicator color="#0f1117" />
            : <Text style={s.btnText}>
                Recargar {selected ? fmt(selected) : '—'} COP
              </Text>}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0f1117' },
  header:             { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 54 : 20, paddingBottom: 16, backgroundColor: '#0a1628' },
  backText:           { color: '#00e5b4', fontSize: 15, fontWeight: '700' },
  title:              { color: '#fff', fontSize: 18, fontWeight: '800' },
  balanceCard:        { backgroundColor: '#0a1628', borderRadius: 18, padding: 20, marginBottom: 24, alignItems: 'center', borderWidth: 1, borderColor: '#00e5b420' },
  balanceLabel:       { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  balanceAmount:      { color: '#00e5b4', fontSize: 36, fontWeight: '900' },
  balanceCurrency:    { color: '#00e5b480', fontSize: 13, fontWeight: '700', marginTop: -4, marginBottom: 6 },
  balanceSub:         { color: '#444', fontSize: 11, textAlign: 'center' },
  sectionLabel:       { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },
  amountsGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  amountBtn:          { backgroundColor: '#1a1d27', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1.5, borderColor: '#2a3040', minWidth: '29%', alignItems: 'center' },
  amountSelected:     { backgroundColor: '#00e5b4', borderColor: '#00e5b4' },
  amountText:         { color: '#888', fontWeight: '700', fontSize: 13 },
  amountTextSelected: { color: '#0f1117' },
  customInput:        { backgroundColor: '#1a1d27', borderRadius: 12, borderWidth: 1.5, borderColor: '#2a3040', color: '#fff', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 24 },
  provCard:           { backgroundColor: '#1a1d27', borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5, borderColor: '#2a3040' },
  provIconBox:        { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  provLabel:          { color: '#fff', fontWeight: '700', fontSize: 13 },
  provSub:            { color: '#555', fontSize: 11, marginTop: 2, marginBottom: 6 },
  methodsRow:         { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  methodBadge:        { backgroundColor: '#0f1117', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  methodText:         { color: '#666', fontSize: 10, fontWeight: '600' },
  radio:              { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#333', justifyContent: 'center', alignItems: 'center' },
  radioDot:           { width: 11, height: 11, borderRadius: 6 },
  securityNote:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#0a1628', borderRadius: 12, padding: 14, marginBottom: 20 },
  securityIcon:       { fontSize: 16 },
  securityText:       { color: '#555', fontSize: 11, flex: 1, lineHeight: 17 },
  checkingBox:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  btn:                { backgroundColor: '#00e5b4', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnText:            { color: '#0f1117', fontWeight: '800', fontSize: 16 },
});

const wv = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0a1628', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 54 : 16, paddingBottom: 12 },
  close:  { color: '#e74c3c', fontSize: 14, fontWeight: '700' },
  title:  { color: '#fff', fontSize: 14, fontWeight: '700' },
});

const nq = StyleSheet.create({
  card:         { backgroundColor: '#1a1d27', borderRadius: 20, padding: 24, alignItems: 'center' },
  icon:         { fontSize: 48, marginBottom: 8 },
  title:        { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  amount:       { color: '#6c11cc', fontSize: 32, fontWeight: '900', marginBottom: 28 },
  step:         { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 18, width: '100%' },
  stepBadge:    { width: 28, height: 28, borderRadius: 14, backgroundColor: '#6c11cc', justifyContent: 'center', alignItems: 'center' },
  stepNum:      { color: '#fff', fontWeight: '800', fontSize: 13 },
  stepText:     { color: '#ccc', fontSize: 13, flex: 1, lineHeight: 20 },
  openBtn:      { backgroundColor: '#6c11cc', borderRadius: 14, paddingVertical: 14, width: '100%', alignItems: 'center', marginTop: 20 },
  openBtnText:  { color: '#fff', fontWeight: '800', fontSize: 16 },
  confirmBtn:   { backgroundColor: '#0f1117', borderRadius: 14, paddingVertical: 14, width: '100%', alignItems: 'center', marginTop: 10, borderWidth: 1.5, borderColor: '#6c11cc40' },
  confirmBtnText: { color: '#6c11cc', fontWeight: '700', fontSize: 15 },
});
