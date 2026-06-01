import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, Linking } from 'react-native';
import { payments } from '../services/api';
import { useAuth } from '../services/AuthContext';

const AMOUNTS = [10000, 20000, 50000, 100000];

export default function TopupScreen({ navigation }) {
  const { user, refreshBalance } = useAuth();
  const [amount,  setAmount]  = useState('');
  const [custom,  setCustom]  = useState('');
  const [loading, setLoading] = useState(false);

  const selected = amount || parseInt(custom.replace(/\D/g, ''), 10) || 0;

  async function handleTopup() {
    if (!selected || selected < 5000) return Alert.alert('Error', 'Monto mínimo: $5.000 COP');
    setLoading(true);
    try {
      const res = await payments.topup(selected, 'lumina://payment/result');
      if (res.checkoutUrl) {
        await Linking.openURL(res.checkoutUrl);
      } else if (res.clientSecret) {
        Alert.alert('Stripe', 'Integra Stripe Elements con el clientSecret: ' + res.clientSecret);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err.error || 'No se pudo iniciar el pago');
    } finally {
      setLoading(false);
      await refreshBalance();
    }
  }

  return (
    <View style={s.container}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
        <Text style={s.backText}>← Volver</Text>
      </TouchableOpacity>

      <Text style={s.title}>Recargar saldo</Text>
      <Text style={s.balance}>Saldo actual: <Text style={{ color: '#00e5b4', fontWeight: '700' }}>${(user?.balance || 0).toLocaleString('es-CO')} COP</Text></Text>

      <Text style={s.label}>Elige un monto</Text>
      <View style={s.amounts}>
        {AMOUNTS.map(a => (
          <TouchableOpacity
            key={a}
            style={[s.amountBtn, amount === a && s.amountSelected]}
            onPress={() => { setAmount(a); setCustom(''); }}
          >
            <Text style={[s.amountText, amount === a && s.amountTextSelected]}>
              ${a.toLocaleString('es-CO')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={s.label}>O ingresa un monto personalizado</Text>
      <TextInput
        style={s.input}
        placeholder="Ej: 30000"
        placeholderTextColor="#555"
        keyboardType="numeric"
        value={custom}
        onChangeText={v => { setCustom(v); setAmount(''); }}
      />

      <TouchableOpacity style={s.btn} onPress={handleTopup} disabled={loading || !selected}>
        {loading ? <ActivityIndicator color="#0f1117" /> : (
          <Text style={s.btnText}>Pagar ${selected ? selected.toLocaleString('es-CO') : '—'} COP vía Wompi</Text>
        )}
      </TouchableOpacity>

      <Text style={s.note}>Serás redirigido al portal de pagos seguro de Wompi.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0f1117', padding: 24, paddingTop: 56 },
  backBtn:            { marginBottom: 24 },
  backText:           { color: '#00e5b4', fontSize: 16, fontWeight: '600' },
  title:              { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 4 },
  balance:            { color: '#aaa', fontSize: 15, marginBottom: 32 },
  label:              { color: '#888', fontSize: 13, marginBottom: 10 },
  amounts:            { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  amountBtn:          { borderWidth: 1.5, borderColor: '#333', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  amountSelected:     { borderColor: '#00e5b4', backgroundColor: '#052e16' },
  amountText:         { color: '#aaa', fontWeight: '600', fontSize: 15 },
  amountTextSelected: { color: '#00e5b4' },
  input:              { backgroundColor: '#1a1d27', color: '#fff', borderRadius: 12, padding: 16, marginBottom: 28, fontSize: 16 },
  btn:                { backgroundColor: '#00e5b4', borderRadius: 14, padding: 18, alignItems: 'center' },
  btnText:            { color: '#0f1117', fontWeight: '700', fontSize: 16 },
  note:               { color: '#555', textAlign: 'center', marginTop: 16, fontSize: 12 },
});
