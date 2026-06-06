import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../services/api';
import { useAuth } from '../services/AuthContext';

const CITIES = ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga', 'Pereira', 'Manizales', 'Otra'];

export default function RegisterScreen({ navigation }) {
  const { login } = useAuth();
  const [form,    setForm]    = useState({ name: '', email: '', password: '', phone: '', city: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const set = k => v => setForm(p => ({ ...p, [k]: v }));

  async function handleRegister() {
    if (!form.name || !form.email || !form.password) {
      return Alert.alert('Campos requeridos', 'Nombre, correo y contraseña son obligatorios');
    }
    if (form.password.length < 6) {
      return Alert.alert('Contraseña muy corta', 'Mínimo 6 caracteres');
    }
    setLoading(true);
    try {
      const res = await auth.register(form);
      await AsyncStorage.setItem('token', res.token);
      await login(form.email.trim().toLowerCase(), form.password);
    } catch (err) {
      Alert.alert('Error al registrarse', err.error || 'No se pudo crear la cuenta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#0a0d14' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>

        <View style={s.logoWrap}>
          <View style={s.logoIcon}><Text style={{ fontSize: 32 }}>⚡</Text></View>
          <Text style={s.logoText}>Lumina</Text>
          <Text style={s.tagline}>Crea tu cuenta y empieza a cargar</Text>
        </View>

        <Field label="Nombre completo" placeholder="Tu nombre" value={form.name} onChangeText={set('name')} />
        <Field label="Correo electrónico" placeholder="tu@correo.com" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Teléfono (opcional)" placeholder="+57 300 000 0000" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" />

        <Text style={s.label}>Contraseña</Text>
        <View style={s.inputRow}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor="#555"
            secureTextEntry={!showPass}
            value={form.password}
            onChangeText={set('password')}
          />
          <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPass(v => !v)}>
            <Text>{showPass ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.label, { marginTop: 16 }]}>Ciudad</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
          {CITIES.map(c => (
            <TouchableOpacity
              key={c}
              style={[s.cityChip, form.city === c && s.cityChipActive]}
              onPress={() => set('city')(c)}
            >
              <Text style={[s.cityText, form.city === c && s.cityTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#0f1117" /> : <Text style={s.btnText}>Crear cuenta</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={s.link}>¿Ya tienes cuenta? <Text style={{ color: '#00e5b4' }}>Inicia sesión</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }) {
  return (
    <>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor="#555" autoCorrect={false} {...props} />
    </>
  );
}

const s = StyleSheet.create({
  container:       { padding: 28, paddingTop: 60, paddingBottom: 40 },
  backBtn:         { marginBottom: 16 },
  backText:        { color: '#00e5b4', fontSize: 15, fontWeight: '600' },
  logoWrap:        { alignItems: 'center', marginBottom: 36 },
  logoIcon:        { width: 64, height: 64, borderRadius: 20, backgroundColor: '#052e16', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  logoText:        { color: '#fff', fontSize: 30, fontWeight: '800' },
  tagline:         { color: '#555', fontSize: 13, marginTop: 4 },
  label:           { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:           { backgroundColor: '#1a1d27', color: '#fff', borderRadius: 12, padding: 16, marginBottom: 4, fontSize: 15, borderWidth: 1, borderColor: '#252830' },
  inputRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  eyeBtn:          { backgroundColor: '#1a1d27', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#252830' },
  cityChip:        { backgroundColor: '#1a1d27', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: '#252830' },
  cityChipActive:  { backgroundColor: '#052e16', borderColor: '#00e5b4' },
  cityText:        { color: '#888', fontWeight: '600', fontSize: 13 },
  cityTextActive:  { color: '#00e5b4' },
  btn:             { backgroundColor: '#00e5b4', borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 8 },
  btnText:         { color: '#0f1117', fontWeight: '800', fontSize: 16 },
  link:            { color: '#555', textAlign: 'center', fontSize: 14 },
});
