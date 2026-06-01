import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { auth } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../services/AuthContext';

export default function RegisterScreen({ navigation }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [loading, setLoading] = useState(false);

  const set = k => v => setForm(p => ({ ...p, [k]: v }));

  async function handleRegister() {
    if (!form.name || !form.email || !form.password) {
      return Alert.alert('Error', 'Nombre, correo y contraseña son requeridos');
    }
    setLoading(true);
    try {
      const res = await auth.register(form);
      await AsyncStorage.setItem('token', res.token);
      await login(form.email.trim().toLowerCase(), form.password);
    } catch (err) {
      Alert.alert('Error', err.error || 'No se pudo crear la cuenta');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: '#0f1117' }} contentContainerStyle={s.container}>
      <Text style={s.logo}>⚡ Lumina</Text>
      <Text style={s.title}>Crear cuenta</Text>

      {[['name', 'Nombre completo'], ['email', 'Correo electrónico'], ['phone', 'Teléfono (opcional)']].map(([k, ph]) => (
        <TextInput
          key={k}
          style={s.input}
          placeholder={ph}
          placeholderTextColor="#888"
          keyboardType={k === 'email' ? 'email-address' : k === 'phone' ? 'phone-pad' : 'default'}
          autoCapitalize="none"
          value={form[k]}
          onChangeText={set(k)}
        />
      ))}
      <TextInput
        style={s.input}
        placeholder="Contraseña"
        placeholderTextColor="#888"
        secureTextEntry
        value={form.password}
        onChangeText={set('password')}
      />

      <TouchableOpacity style={s.btn} onPress={handleRegister} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Registrarse</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={s.link}>¿Ya tienes cuenta? Inicia sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: '#0f1117', padding: 28, paddingTop: 80 },
  logo:      { fontSize: 36, fontWeight: '800', color: '#00e5b4', textAlign: 'center', marginBottom: 4 },
  title:     { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 32 },
  input:     { backgroundColor: '#1a1d27', color: '#fff', borderRadius: 12, padding: 16, marginBottom: 14, fontSize: 15 },
  btn:       { backgroundColor: '#00e5b4', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText:   { color: '#0f1117', fontWeight: '700', fontSize: 16 },
  link:      { color: '#00e5b4', textAlign: 'center', marginTop: 20, fontSize: 14 },
});
